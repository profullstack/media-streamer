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
      const segmentCount = (content.match(/\.ts\n/g) || []).length;
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
    const rewritten = content.replace(/^(segment\d+\.ts)$/gm, 
      `/api/stream/hls/segment?infohash=${infohash}&fileIndex=${fileIndex}&file=$1`);
    
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

    // Wait for first data chunk
    const sourceStream = result.stream as NodeJS.ReadableStream;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for data')), 60000);
      const onData = (): void => {
        clearTimeout(timeout);
        sourceStream.removeListener('data', onData);
        resolve();
      };
      sourceStream.on('data', onData);
      sourceStream.on('error', (err: Error) => { clearTimeout(timeout); reject(err); });
    });

    // Build FFmpeg HLS args
    const ffmpegArgs: string[] = [
      '-threads', '2',
      '-probesize', '20000000',
      '-analyzeduration', '10000000',
    ];
    
    if (demuxer) {
      ffmpegArgs.push('-f', demuxer);
    }
    
    ffmpegArgs.push(
      '-i', 'pipe:0',
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
      // HLS specific
      '-f', 'hls',
      '-hls_time', '4',           // 4-second segments
      '-hls_list_size', '0',      // Keep all segments in playlist
      '-hls_flags', 'delete_segments+append_list+independent_segments',
      '-hls_segment_filename', join(hlsDir, 'segment%d.ts'),
      join(hlsDir, 'stream.m3u8'),
    );

    reqLogger.info('Starting FFmpeg HLS transcoding', {
      args: ffmpegArgs.join(' '),
    });

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Register with FFmpeg manager
    const ffmpegManager = getFFmpegManager();
    ffmpegManager.register(ffmpeg, { fileName: info.fileName });

    // Pipe source to FFmpeg
    sourceStream.pipe(ffmpeg.stdin);

    ffmpeg.stdin.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
        reqLogger.warn('FFmpeg stdin error', { error: err.message });
      }
    });

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('time=')) {
        reqLogger.debug('FFmpeg HLS progress', { progress: msg.trim().slice(-80) });
      }
    });

    ffmpeg.on('close', (code: number | null) => {
      if (code !== 0 && code !== null) {
        reqLogger.warn('FFmpeg HLS exited with non-zero code', { code });
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
    const rewritten = playlist.replace(/^(segment\d+\.ts)$/gm,
      `/api/stream/hls/segment?infohash=${infohash}&fileIndex=${fileIndex}&file=$1`);

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
