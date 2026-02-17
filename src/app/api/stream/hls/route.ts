/**
 * HLS Transcoding Stream API
 * 
 * Creates an HLS (HTTP Live Streaming) output for iOS/Safari compatibility.
 * FFmpeg transcodes the source and outputs HLS segments + playlist to a temp dir.
 * This endpoint returns the m3u8 playlist, and segments are served via the /hls/[...path] route.
 *
 * GET /api/stream/hls?infohash=...&fileIndex=...
 * 
 * Returns: m3u8 playlist (application/vnd.apple.mpegurl)
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger, generateRequestId } from '@/lib/logger';
import { getStreamingService } from '@/lib/streaming';
import { getTorrentByInfohash } from '@/lib/supabase';
import { getFFmpegDemuxerForExtension } from '@/lib/codec-detection';
import { getFFmpegManager } from '@/lib/ffmpeg-manager';

const logger = createLogger('API:stream:hls');

// HLS temp directory base
const HLS_BASE_DIR = join(process.env.HOME ?? '/tmp', 'tmp', 'hls-transcode');

/**
 * Get or create HLS output directory for a specific stream
 */
function getHlsDir(infohash: string, fileIndex: number): string {
  const dir = join(HLS_BASE_DIR, `${infohash}_${fileIndex}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Check if an HLS session is already running for this torrent/file
 */
function isHlsSessionActive(infohash: string, fileIndex: number): boolean {
  const dir = getHlsDir(infohash, fileIndex);
  const playlistPath = join(dir, 'stream.m3u8');
  if (!existsSync(playlistPath)) return false;
  
  // Check if playlist was updated recently (within last 30 seconds)
  try {
    const stat = statSync(playlistPath);
    return Date.now() - stat.mtimeMs < 30000;
  } catch {
    return false;
  }
}

/**
 * Wait for HLS playlist to have at least N segments
 */
async function waitForPlaylist(dir: string, minSegments: number, timeoutMs: number): Promise<string | null> {
  const playlistPath = join(dir, 'stream.m3u8');
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    if (existsSync(playlistPath)) {
      const content = readFileSync(playlistPath, 'utf-8');
      const segmentCount = (content.match(/\.(ts|m4s)\n/g) || []).length;
      if (segmentCount >= minSegments) {
        return content;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}

async function getMagnetUri(infohash: string): Promise<string> {
  const torrent = await getTorrentByInfohash(infohash);
  if (torrent?.magnet_uri) {
    return torrent.magnet_uri;
  }
  return `magnet:?xt=urn:btih:${infohash}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  // Subscription check
  const { requireActiveSubscription } = await import('@/lib/subscription/guard');
  const subscriptionError = await requireActiveSubscription(request);
  if (subscriptionError) return subscriptionError;

  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });

  const { searchParams } = new URL(request.url);
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');

  if (!infohash || !fileIndexStr) {
    return NextResponse.json({ error: 'Missing infohash or fileIndex' }, { status: 400 });
  }

  const fileIndex = parseInt(fileIndexStr, 10);
  if (isNaN(fileIndex) || fileIndex < 0) {
    return NextResponse.json({ error: 'Invalid fileIndex' }, { status: 400 });
  }

  const hlsDir = getHlsDir(infohash, fileIndex);
  
  reqLogger.info('HLS stream request', { infohash, fileIndex, hlsDir });

  // If HLS session already active, just return the playlist
  if (isHlsSessionActive(infohash, fileIndex)) {
    reqLogger.info('Reusing existing HLS session');
    const playlistPath = join(hlsDir, 'stream.m3u8');
    const content = readFileSync(playlistPath, 'utf-8');
    
    // Rewrite segment URLs to be absolute
    const segBase = `/api/stream/hls/segment?infohash=${infohash}&fileIndex=${fileIndex}&file=`;
    const rewritten = content
      .replace(/^(segment\d+\.ts)$/gm, `${segBase}$1`)
      .replace(/^(segment\d+\.m4s)$/gm, `${segBase}$1`)
      .replace(/^(init\.mp4)$/gm, `${segBase}$1`)
      .replace(/#EXT-X-MAP:URI="init\.mp4"/g, `#EXT-X-MAP:URI="${segBase}init.mp4"`);
    
    return new Response(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Start new HLS transcoding session
  try {
    const magnetUri = await getMagnetUri(infohash);
    const service = getStreamingService();
    
    reqLogger.info('Getting stream info for HLS');
    const info = await service.getStreamInfo({ magnetUri, fileIndex });
    
    // Determine demuxer from file extension
    const ext = info.fileName.split('.').pop()?.toLowerCase();
    const demuxer = ext ? getFFmpegDemuxerForExtension(ext) : null;
    
    reqLogger.info('Creating source stream for HLS transcoding', {
      fileName: info.fileName,
      demuxer,
    });

    // Create the source stream
    const result = await service.createStream({
      magnetUri,
      fileIndex,
      range: undefined,
    }, true); // skipWaitForData

    const sourceStream = result.stream as NodeJS.ReadableStream;

    // Detect if we can do audio-only remux (copy video, transcode audio)
    // This is MUCH faster than full re-encode and preserves HEVC/DV quality
    const INCOMPATIBLE_AUDIO_CODECS = new Set(['eac3', 'ac3', 'truehd', 'dts', 'dca', 'mlp']);
    const NATIVE_VIDEO_CODECS = new Set(['hevc', 'h265', 'h264', 'avc', 'avc1', 'vp9', 'av1']);
    let audioOnlyRemux = false;
    let localInputPath: string | null = null;
    
    // Try to find local file and detect codecs via FFprobe
    try {
      const { getWebTorrentDir } = await import('@/lib/config');
      const { existsSync, statSync } = await import('node:fs');
      const { join: pathJoin } = await import('node:path');
      const { detectCodecFromUrl } = await import('@/lib/codec-detection');
      
      const downloadDir = getWebTorrentDir();
      const filePath = pathJoin(downloadDir, info.filePath);
      const fileExists = existsSync(filePath);
      let fileSize = 0;
      if (fileExists) {
        try { fileSize = statSync(filePath).size; } catch { /* */ }
      }
      
      reqLogger.info('HLS: checking local file for codec detection', {
        downloadDir,
        infoFilePath: info.filePath,
        fullPath: filePath,
        exists: fileExists,
        fileSize,
      });
      
      if (fileExists && fileSize > 0) {
        // Always prefer local file as FFmpeg input (more reliable than pipe)
        localInputPath = filePath;
        
        try {
          const codecInfo = await detectCodecFromUrl(filePath, 15);
          reqLogger.info('HLS: codec detection result', {
            videoCodec: codecInfo.videoCodec,
            audioCodec: codecInfo.audioCodec,
          });
          if (codecInfo.videoCodec && NATIVE_VIDEO_CODECS.has(codecInfo.videoCodec.toLowerCase()) &&
              codecInfo.audioCodec && INCOMPATIBLE_AUDIO_CODECS.has(codecInfo.audioCodec.toLowerCase())) {
            audioOnlyRemux = true;
            reqLogger.info('HLS: using audio-only remux (video copy)', {
              videoCodec: codecInfo.videoCodec,
              audioCodec: codecInfo.audioCodec,
            });
          }
        } catch (codecErr) {
          reqLogger.warn('HLS: codec detection failed, will use full transcode from local file', {
            error: codecErr instanceof Error ? codecErr.message : String(codecErr),
          });
        }
      }
    } catch (err) {
      reqLogger.warn('HLS: local file check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Build FFmpeg HLS args
    const ffmpegArgs: string[] = [
      '-threads', '2',
      '-probesize', '20000000',
      '-analyzeduration', '10000000',
    ];
    
    // Only set demuxer when reading from pipe (local file auto-detects)
    if (!localInputPath && demuxer) {
      ffmpegArgs.push('-f', demuxer);
    }

    if (audioOnlyRemux) {
      // Audio-only remux: copy video stream, transcode only audio
      // Use fMP4 segments for HEVC compatibility (MPEG-TS doesn't support HEVC well)
      ffmpegArgs.push(
        '-i', localInputPath || 'pipe:0',
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'copy',
        '-tag:v', 'hvc1',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_flags', 'append_list+independent_segments',
        '-hls_segment_type', 'fmp4',
        '-hls_fmp4_init_filename', 'init.mp4',
        '-hls_segment_filename', join(hlsDir, 'segment%d.m4s'),
        join(hlsDir, 'stream.m3u8'),
      );
    } else {
      // Full transcode: re-encode video to H.264
      ffmpegArgs.push(
        '-i', localInputPath || 'pipe:0',
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-acodec', 'aac',
        '-vcodec', 'libx264',
        '-vf', "scale=-2:'min(720,ceil(ih/2)*2)':flags=bilinear",
        '-preset', 'fast',
        '-tune', 'zerolatency',
        '-profile:v', 'main',
        '-level:v', '3.1',
        '-pix_fmt', 'yuv420p',
        '-g', '60',
        '-bf', '0',
        '-crf', '26',
        '-maxrate', '2.5M',
        '-bufsize', '5M',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_flags', 'append_list+independent_segments',
        '-hls_segment_filename', join(hlsDir, 'segment%d.ts'),
        join(hlsDir, 'stream.m3u8'),
      );
    }

    reqLogger.info('Starting FFmpeg HLS transcoding', {
      args: ffmpegArgs.join(' '),
    });

    const useLocalInput = !!localInputPath;
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: [useLocalInput ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });

    // Register with FFmpeg manager
    const ffmpegManager = getFFmpegManager();
    ffmpegManager.register(ffmpeg, { fileName: info.fileName, infohash });

    // Pipe source to FFmpeg (only needed when reading from pipe, not local file)
    if (!useLocalInput && ffmpeg.stdin) {
      sourceStream.pipe(ffmpeg.stdin as unknown as NodeJS.WritableStream);
    }

    ffmpeg.stdin?.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
        reqLogger.warn('FFmpeg stdin error', { error: err.message });
      }
    });

    let ffmpegStderr = '';
    ffmpeg.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      ffmpegStderr += msg;
      // Keep only last 4KB of stderr
      if (ffmpegStderr.length > 4096) ffmpegStderr = ffmpegStderr.slice(-4096);
      if (msg.includes('time=')) {
        reqLogger.debug('FFmpeg HLS progress', { progress: msg.trim().slice(-80) });
      }
    });

    ffmpeg.on('close', (code: number | null) => {
      if (code !== 0 && code !== null) {
        reqLogger.warn('FFmpeg HLS exited with non-zero code', { code, stderr: ffmpegStderr.slice(-500) });
      } else {
        reqLogger.info('FFmpeg HLS transcoding completed');
      }
    });

    // Wait for first few segments to be ready
    reqLogger.info('Waiting for initial HLS segments...');
    const playlist = await waitForPlaylist(hlsDir, 2, 60000);
    
    if (!playlist) {
      reqLogger.error('Timed out waiting for HLS segments');
      ffmpeg.kill('SIGTERM');
      return NextResponse.json(
        { error: 'Failed to start HLS transcoding' },
        { status: 503 }
      );
    }

    reqLogger.info('HLS playlist ready, serving');

    // Rewrite segment URLs to be absolute
    const segBase = `/api/stream/hls/segment?infohash=${infohash}&fileIndex=${fileIndex}&file=`;
    const rewritten = playlist
      .replace(/^(segment\d+\.ts)$/gm, `${segBase}$1`)
      .replace(/^(segment\d+\.m4s)$/gm, `${segBase}$1`)
      .replace(/^(init\.mp4)$/gm, `${segBase}$1`)
      .replace(/#EXT-X-MAP:URI="init\.mp4"/g, `#EXT-X-MAP:URI="${segBase}init.mp4"`);

    return new Response(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    reqLogger.error('HLS stream error', error);
    return NextResponse.json(
      { error: 'Failed to start HLS stream' },
      { status: 500 }
    );
  }
}
