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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLogger, generateRequestId } from '@/lib/logger';
import { getStreamingService } from '@/lib/streaming';
import { getTorrentByInfohash } from '@/lib/supabase';
import { getFFmpegDemuxerForExtension } from '@/lib/codec-detection';
import { getFFmpegManager } from '@/lib/ffmpeg-manager';

const logger = createLogger('API:stream:hls');

// HLS temp directory base
const HLS_BASE_DIR = join(process.env.HOME ?? '/tmp', 'tmp', 'hls-transcode');

/**
 * Get or create HLS output directory for a specific stream session.
 * Each user/session gets its own directory to avoid sharing live playlists
 * (which causes new users to start from the live edge instead of the beginning).
 */
function getHlsDir(infohash: string, fileIndex: number, sessionId?: string): string {
  const suffix = sessionId ? `_${sessionId}` : '';
  const dir = join(HLS_BASE_DIR, `${infohash}_${fileIndex}${suffix}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Check if an HLS session is already running for a specific session directory
 */
function isHlsSessionActive(hlsDir: string): boolean {
  const playlistPath = join(hlsDir, 'stream.m3u8');
  if (!existsSync(playlistPath)) return false;
  
  try {
    const content = readFileSync(playlistPath, 'utf-8');
    // If playlist has ENDLIST, transcode is complete — always reuse
    if (content.includes('#EXT-X-ENDLIST')) return true;
    // Otherwise check if playlist was updated recently (FFmpeg still running)
    const s = statSync(playlistPath);
    return Date.now() - s.mtimeMs < 30000;
  } catch {
    return false;
  }
}

/**
 * Find an existing active HLS session for a given infohash+fileIndex.
 * Returns the session directory and sessionId if found, null otherwise.
 */
function findActiveSession(infohash: string, fileIndex: number): { hlsDir: string; sessionId: string } | null {
  if (!existsSync(HLS_BASE_DIR)) return null;
  const prefix = `${infohash}_${fileIndex}_`;
  try {
    const entries = readdirSync(HLS_BASE_DIR);
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) continue;
      const dir = join(HLS_BASE_DIR, entry);
      if (isHlsSessionActive(dir)) {
        const sid = entry.slice(prefix.length);
        return { hlsDir: dir, sessionId: sid };
      }
    }
  } catch { /* */ }
  return null;
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

  // CORS headers required for iOS Safari's native HLS player.
  // Safari's media engine fetches the playlist and segments from an internal context
  // that may require CORS headers even for same-origin requests.
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
  };

  // Check for an existing active HLS session for this infohash+fileIndex.
  // Safari's native HLS player re-fetches the playlist URL to discover new segments.
  // We must return the updated playlist from the same FFmpeg session, not start a new one.
  //
  // NOTE: No subscription check for re-fetches. Safari's native HLS player makes
  // periodic playlist requests from its internal media engine, which may NOT include
  // session cookies. The initial request (new session below) is auth-gated.
  // Rejecting a playlist re-fetch kills playback entirely.
  const existing = findActiveSession(infohash, fileIndex);
  if (existing) {
    reqLogger.info('Reusing existing HLS session', { sessionId: existing.sessionId });
    const playlistPath = join(existing.hlsDir, 'stream.m3u8');
    const content = readFileSync(playlistPath, 'utf-8');
    
    const segBase = `/api/stream/hls/segment?infohash=${infohash}&fileIndex=${fileIndex}&sessionId=${existing.sessionId}&file=`;
    const rewritten = content
      .replace(/^(segment\d+\.ts)$/gm, `${segBase}$1`)
      .replace(/^(segment\d+\.m4s)$/gm, `${segBase}$1`)
      .replace(/^(init\.mp4)$/gm, `${segBase}$1`)
      .replace(/#EXT-X-MAP:URI="init\.mp4"/g, `#EXT-X-MAP:URI="${segBase}init.mp4"`);
    
    return new Response(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store',
        ...corsHeaders,
      },
    });
  }

  // Subscription check — only for NEW sessions (initial playlist request).
  // Re-fetches of existing sessions skip this (handled above).
  const { requireActiveSubscription } = await import('@/lib/subscription/guard');
  const subscriptionError = await requireActiveSubscription(request);
  if (subscriptionError) return subscriptionError;

  // No existing session — start a new one
  const sessionId = randomUUID().slice(0, 8);
  const hlsDir = getHlsDir(infohash, fileIndex, sessionId);
  
  reqLogger.info('HLS stream request - starting new session', { infohash, fileIndex, sessionId, hlsDir });

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
    let audioOnlyRemux = false;  // copy video, transcode audio
    let copyRemux = false;       // copy both video and audio (no transcode)
    let localInputPath: string | null = null;
    let detectedVideoCodec: string | null = null;
    
    // Try to find local file and detect codecs via FFprobe
    try {
      const { getWebTorrentDir } = await import('@/lib/config');
      const { existsSync, statSync } = await import('node:fs');
      const { join: pathJoin } = await import('node:path');
      const { detectCodecFromUrl } = await import('@/lib/codec-detection');
      
      const downloadDir = getWebTorrentDir();
      const filePath = pathJoin(downloadDir, info.filePath);
      
      // Wait for file to appear on disk (WebTorrent may not have created it yet)
      // WebTorrent creates the file immediately but writes pieces as they arrive.
      // We need sufficient data for FFprobe codec detection (~5MB for MP4 with moov at end).
      let fileExists = existsSync(filePath);
      let fileSize = 0;
      if (!fileExists) {
        reqLogger.info('HLS: local file not found yet, waiting up to 30s for WebTorrent to create it', {
          fullPath: filePath,
        });
        for (let i = 0; i < 30 && !fileExists; i++) {
          await new Promise(r => setTimeout(r, 1000));
          fileExists = existsSync(filePath);
        }
      }
      if (fileExists) {
        try { fileSize = statSync(filePath).size; } catch { /* */ }
        // Wait for enough data for FFprobe to detect codecs reliably.
        // MP4 files need the moov atom (streaming service prioritizes downloading
        // the last 10MB + first 1MB), but other formats need at least some data.
        // Wait up to 30s for the file to grow beyond a minimum threshold.
        const MIN_CODEC_DETECT_SIZE = 2 * 1024 * 1024; // 2MB minimum for codec detection
        if (fileSize < MIN_CODEC_DETECT_SIZE) {
          reqLogger.info('HLS: waiting for more data before codec detection', {
            currentSize: fileSize, minRequired: MIN_CODEC_DETECT_SIZE,
          });
          for (let i = 0; i < 30 && fileSize < MIN_CODEC_DETECT_SIZE; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try { fileSize = statSync(filePath).size; } catch { break; }
          }
          reqLogger.info('HLS: file size after waiting', { fileSize });
        }
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
          detectedVideoCodec = codecInfo.videoCodec ?? null;
          reqLogger.info('HLS: codec detection result', {
            videoCodec: codecInfo.videoCodec,
            audioCodec: codecInfo.audioCodec,
            videoProfile: codecInfo.videoProfile,
            pixFmt: codecInfo.pixFmt,
          });
          
          // Detect 10-bit / HDR content — iOS Safari crashes on HEVC Main 10
          // even on devices with hardware decode, especially in HLS fMP4 segments.
          // Force full transcode to 8-bit H.264 for maximum compatibility.
          const is10Bit = codecInfo.pixFmt?.includes('10') || 
            codecInfo.videoProfile?.toLowerCase().includes('main 10') ||
            codecInfo.videoProfile?.toLowerCase().includes('high 10');
          
          if (is10Bit) {
            reqLogger.info('HLS: detected 10-bit video, forcing full H.264 transcode for iOS compatibility', {
              pixFmt: codecInfo.pixFmt,
              profile: codecInfo.videoProfile,
            });
            // Don't set copyRemux or audioOnlyRemux — fall through to full transcode
          } else if (codecInfo.videoCodec && NATIVE_VIDEO_CODECS.has(codecInfo.videoCodec.toLowerCase())) {
            if (codecInfo.audioCodec && INCOMPATIBLE_AUDIO_CODECS.has(codecInfo.audioCodec.toLowerCase())) {
              audioOnlyRemux = true;
              reqLogger.info('HLS: using audio-only remux (copy video, transcode audio)', {
                videoCodec: codecInfo.videoCodec,
                audioCodec: codecInfo.audioCodec,
              });
            } else {
              copyRemux = true;
              reqLogger.info('HLS: using full copy remux (copy both video and audio)', {
                videoCodec: codecInfo.videoCodec,
                audioCodec: codecInfo.audioCodec,
              });
            }
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

    // For copy-remux paths using local file, verify the file has enough data.
    // WebTorrent downloads pieces that may arrive out of order, creating a sparse file.
    // Copy-remux from a sparse file fails because FFmpeg reads sequentially and hits gaps.
    // For full transcode, pipe input (sequential WebTorrent stream) is more reliable.
    //
    // Strategy:
    // - Copy/audio remux: REQUIRE local file with sufficient data (codec detection succeeded)
    //   FFmpeg needs moov atom for MP4 which is available if FFprobe succeeded.
    //   Add '-err_detect ignore_err' to tolerate minor gaps in data.
    // - Full transcode: prefer pipe input for sequential streaming, fall back to local file
    
    // Build FFmpeg HLS args
    const ffmpegArgs: string[] = [
      '-threads', '2',
      '-fflags', '+genpts+discardcorrupt+igndts',
      '-probesize', '20000000',
      '-analyzeduration', '10000000',
      // Tolerate I/O errors from partially-downloaded files (WebTorrent sparse files)
      '-err_detect', 'ignore_err',
    ];
    
    // Only set demuxer when reading from pipe (local file auto-detects)
    if (!localInputPath && demuxer) {
      ffmpegArgs.push('-f', demuxer);
    }

    // Determine input source:
    // - copy/audio remux: MUST use local file (needs moov atom seeking for MP4)
    // - full transcode: prefer pipe (sequential, handles buffering) unless local file exists
    const inputForCopyRemux = localInputPath || 'pipe:0';
    const inputForTranscode = localInputPath || 'pipe:0';

    if (copyRemux) {
      // Full copy remux: copy both video and audio streams (no transcoding)
      // Use fMP4 segments for broad compatibility
      const isHEVC = detectedVideoCodec && ['hevc', 'h265'].includes(detectedVideoCodec.toLowerCase());
      ffmpegArgs.push(
        '-i', inputForCopyRemux,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'copy',
        // Only tag as hvc1 for actual HEVC streams — wrong tag on H.264 causes iOS crashes
        ...(isHEVC ? ['-tag:v', 'hvc1'] : []),
        '-c:a', 'copy',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_flags', 'independent_segments',
        // Use fMP4 for HEVC (MPEG-TS doesn't support HEVC well), TS for H.264
        ...(isHEVC ? [
          '-hls_segment_type', 'fmp4',
          '-hls_fmp4_init_filename', 'init.mp4',
          '-hls_segment_filename', join(hlsDir, 'segment%d.m4s'),
        ] : [
          '-hls_segment_filename', join(hlsDir, 'segment%d.ts'),
        ]),
        join(hlsDir, 'stream.m3u8'),
      );
    } else if (audioOnlyRemux) {
      // Audio-only remux: copy video stream, transcode only audio
      const isHEVCAudio = detectedVideoCodec && ['hevc', 'h265'].includes(detectedVideoCodec.toLowerCase());
      ffmpegArgs.push(
        '-i', inputForCopyRemux,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'copy',
        ...(isHEVCAudio ? ['-tag:v', 'hvc1'] : []),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_flags', 'independent_segments',
        ...(isHEVCAudio ? [
          '-hls_segment_type', 'fmp4',
          '-hls_fmp4_init_filename', 'init.mp4',
          '-hls_segment_filename', join(hlsDir, 'segment%d.m4s'),
        ] : [
          '-hls_segment_filename', join(hlsDir, 'segment%d.ts'),
        ]),
        join(hlsDir, 'stream.m3u8'),
      );
    } else {
      // Full transcode: re-encode video to H.264
      ffmpegArgs.push(
        '-i', inputForTranscode,
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
        '-hls_flags', 'independent_segments',
        '-hls_segment_filename', join(hlsDir, 'segment%d.ts'),
        join(hlsDir, 'stream.m3u8'),
      );
    }

    // Clear any stale files from previous sessions (prevents codec mismatch
    // when old .ts segments mix with new .m4s segments in the playlist)
    try {
      const entries = readdirSync(hlsDir);
      for (const entry of entries) {
        rmSync(join(hlsDir, entry), { force: true });
      }
    } catch { /* best effort */ }

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

    // Wait for first few segments to be ready before serving the playlist.
    // Copy-remux is much faster than full transcode, so we can use fewer initial
    // segments (2 = 8s) to reduce time-to-playback on iOS.
    // Full transcode needs 3 segments (12s) for Safari to have enough runway.
    const minSegments = (copyRemux || audioOnlyRemux) ? 2 : 3;
    reqLogger.info('Waiting for initial HLS segments...', { minSegments, copyRemux, audioOnlyRemux });
    const playlist = await waitForPlaylist(hlsDir, minSegments, 90000);
    
    if (!playlist) {
      reqLogger.error('Timed out waiting for HLS segments');
      ffmpeg.kill('SIGTERM');
      return NextResponse.json(
        { error: 'Failed to start HLS transcoding' },
        { status: 503 }
      );
    }

    reqLogger.info('HLS playlist ready, serving initial playlist');

    // Serve the current playlist. Subsequent requests to the same URL will hit
    // findActiveSession() above and return the updated playlist as FFmpeg produces
    // more segments. This is how Safari's native HLS player discovers new segments.
    const segBase = `/api/stream/hls/segment?infohash=${infohash}&fileIndex=${fileIndex}&sessionId=${sessionId}&file=`;
    const rewritten = playlist
      .replace(/^(segment\d+\.ts)$/gm, `${segBase}$1`)
      .replace(/^(segment\d+\.m4s)$/gm, `${segBase}$1`)
      .replace(/^(init\.mp4)$/gm, `${segBase}$1`)
      .replace(/#EXT-X-MAP:URI="init\.mp4"/g, `#EXT-X-MAP:URI="${segBase}init.mp4"`);

    return new Response(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store',
        ...corsHeaders,
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

/**
 * OPTIONS /api/stream/hls
 * Handle CORS preflight requests for iOS Safari's native HLS player.
 * Safari's media engine may send preflight requests when fetching playlists.
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      'Access-Control-Max-Age': '86400',
    },
  });
}
