import { NextRequest, NextResponse } from 'next/server';
import { getStreamingService } from '@/lib/streaming';

/**
 * POST /api/stream/release?infohash=...
 * 
 * Called by the frontend when the user closes the player modal.
 * Triggers torrent cleanup (with destroyStore: true to free disk space).
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
  
  const service = getStreamingService();
  service.releaseTorrent(infohash);
  
  return NextResponse.json({ ok: true });
}
