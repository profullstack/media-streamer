/**
 * HLS Segment Server
 * 
 * Serves individual HLS .ts segments from the temp directory.
 * 
 * GET /api/stream/hls/segment?infohash=...&fileIndex=...&file=segment0.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HLS_BASE_DIR = join(process.env.HOME ?? '/tmp', 'tmp', 'hls-transcode');

export async function GET(request: NextRequest): Promise<Response> {
  // NOTE: No subscription check here — Safari's native HLS player fetches segments
  // without cookies/auth from the page context. The HLS playlist endpoint is already
  // auth-gated, and segment URLs contain unpredictable infohash values.

  const { searchParams } = new URL(request.url);
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');
  const file = searchParams.get('file');

  if (!infohash || !fileIndexStr || !file) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // Sanitize filename to prevent path traversal
  const safeFile = file.replace(/[^a-zA-Z0-9._-]/g, '');
  const validExtension = safeFile.endsWith('.ts') || safeFile.endsWith('.m4s') || safeFile === 'init.mp4';
  if (!validExtension || safeFile.includes('..')) {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
  }

  const fileIndex = parseInt(fileIndexStr, 10);
  const sessionId = searchParams.get('sessionId');
  const suffix = sessionId ? `_${sessionId}` : '';
  const segmentPath = join(HLS_BASE_DIR, `${infohash}_${fileIndex}${suffix}`, safeFile);

  if (!existsSync(segmentPath)) {
    // Segment may not be ready yet — wait with retries
    // iOS Safari aborts playback on 404, so we need to wait long enough
    // for FFmpeg to produce the segment (especially for full transcode)
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (existsSync(segmentPath)) break;
    }
    if (!existsSync(segmentPath)) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }
  }
  
  // Ensure segment is fully written (not mid-write by FFmpeg)
  // Wait until file size stabilizes
  let lastSize = 0;
  for (let i = 0; i < 5; i++) {
    const currentSize = statSync(segmentPath).size;
    if (currentSize > 0 && currentSize === lastSize) break;
    lastSize = currentSize;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const data = readFileSync(segmentPath);
  const stat = statSync(segmentPath);

  return new Response(data, {
    headers: {
      'Content-Type': segmentPath.endsWith('.m4s') || segmentPath.endsWith('.mp4') ? 'video/mp4' : 'video/MP2T',
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
