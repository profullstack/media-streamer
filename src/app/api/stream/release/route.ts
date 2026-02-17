import { NextRequest, NextResponse } from 'next/server';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getStreamingService } from '@/lib/streaming';
import { getFFmpegManager } from '@/lib/ffmpeg-manager';

/**
 * POST /api/stream/release?infohash=...
 * 
 * Called by the frontend when the user closes the player modal.
 * Kills FFmpeg processes and schedules deferred cleanup of HLS temp dirs
 * and torrent data. The delay allows the user to reopen the same content
 * without re-downloading or re-transcoding.
 */

const CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const pendingCleanups = new Map<string, NodeJS.Timeout>();

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const infohash = searchParams.get('infohash');
  
  if (!infohash) {
    return NextResponse.json({ error: 'Missing infohash' }, { status: 400 });
  }
  
  // Kill any FFmpeg processes for this infohash immediately
  const ffmpegManager = getFFmpegManager();
  const killed = ffmpegManager.killByInfohash(infohash);
  
  // Cancel any previous pending cleanup for this infohash (user might reopen)
  if (pendingCleanups.has(infohash)) {
    clearTimeout(pendingCleanups.get(infohash)!);
    pendingCleanups.delete(infohash);
  }
  
  // Schedule deferred cleanup — HLS dirs + torrent data
  const timeout = setTimeout(() => {
    pendingCleanups.delete(infohash);
    
    // Clean up HLS temp directories for this infohash
    const hlsBaseDir = join(process.env.HOME ?? '/tmp', 'tmp', 'hls-transcode');
    try {
      const { readdirSync } = await import('node:fs');
      if (existsSync(hlsBaseDir)) {
        for (const entry of readdirSync(hlsBaseDir) as string[]) {
          if (entry.startsWith(`${infohash}_`)) {
            rmSync(join(hlsBaseDir, entry), { recursive: true, force: true });
          }
        }
      }
    } catch { /* best effort */ }
    
    // Release torrent data
    const service = getStreamingService();
    service.releaseTorrent(infohash);
  }, CLEANUP_DELAY_MS);
  
  pendingCleanups.set(infohash, timeout);
  
  return NextResponse.json({ ok: true, ffmpegKilled: killed, cleanupDelayMs: CLEANUP_DELAY_MS });
}
