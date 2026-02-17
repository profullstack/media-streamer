import { NextRequest, NextResponse } from 'next/server';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getStreamingService } from '@/lib/streaming';
import { getFFmpegManager } from '@/lib/ffmpeg-manager';

/**
 * POST /api/stream/release?infohash=...
 * 
 * Called by the frontend when the user closes the player modal.
 * Triggers torrent cleanup (with destroyStore: true to free disk space).
 * Also kills any FFmpeg transcoding processes for this infohash.
 * 
 * This is the ONLY path that should trigger file deletion.
 * SSE disconnects and buffering events should NOT delete files.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const infohash = searchParams.get('infohash');
  
  if (!infohash) {
    return NextResponse.json({ error: 'Missing infohash' }, { status: 400 });
  }
  
  // Kill any FFmpeg processes for this infohash
  const ffmpegManager = getFFmpegManager();
  const killed = ffmpegManager.killByInfohash(infohash);
  
  // Clean up HLS temp directories for this infohash
  const hlsBaseDir = join(process.env.HOME ?? '/tmp', 'tmp', 'hls-transcode');
  try {
    // Remove all HLS dirs matching this infohash (any fileIndex)
    const { readdirSync } = await import('node:fs');
    if (existsSync(hlsBaseDir)) {
      for (const entry of readdirSync(hlsBaseDir)) {
        if (entry.startsWith(`${infohash}_`)) {
          rmSync(join(hlsBaseDir, entry), { recursive: true, force: true });
        }
      }
    }
  } catch { /* best effort */ }
  
  const service = getStreamingService();
  service.releaseTorrent(infohash);
  
  return NextResponse.json({ ok: true, ffmpegKilled: killed });
}
