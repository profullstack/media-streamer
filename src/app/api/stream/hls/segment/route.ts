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
  // Subscription check
  const { requireActiveSubscription } = await import('@/lib/subscription/guard');
  const subscriptionError = await requireActiveSubscription(request);
  if (subscriptionError) return subscriptionError;

  const { searchParams } = new URL(request.url);
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');
  const file = searchParams.get('file');

  if (!infohash || !fileIndexStr || !file) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // Sanitize filename to prevent path traversal
  const safeFile = file.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeFile.endsWith('.ts') || safeFile.includes('..')) {
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
  }

  const fileIndex = parseInt(fileIndexStr, 10);
  const segmentPath = join(HLS_BASE_DIR, `${infohash}_${fileIndex}`, safeFile);

  if (!existsSync(segmentPath)) {
    // Segment may not be ready yet — wait briefly
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!existsSync(segmentPath)) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }
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
