/**
 * HLS Segment Server
 * 
 * Serves individual HLS .ts/.m4s segments and init.mp4 from the temp directory.
 * Safari's native HLS player fetches these segments as it parses the m3u8 playlist.
 * 
 * iOS Safari requirements:
 * - Must respond quickly (Safari aborts on slow segment loads)
 * - Must support Range requests (Safari sometimes requests partial segments)
 * - Must have correct Content-Type and Content-Length headers
 * - Must have CORS headers (Safari may fetch from service worker context)
 * - 404 on a segment causes Safari to abort playback entirely
 * 
 * GET /api/stream/hls/segment?infohash=...&fileIndex=...&sessionId=...&file=segment0.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HLS_BASE_DIR = join(process.env.HOME ?? '/tmp', 'tmp', 'hls-transcode');

/**
 * Resolve the segment file path from request parameters
 */
function resolveSegmentPath(searchParams: URLSearchParams): { segmentPath: string; safeFile: string } | { error: string; status: number } {
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');
  const file = searchParams.get('file');

  if (!infohash || !fileIndexStr || !file) {
    return { error: 'Missing parameters', status: 400 };
  }

  // Sanitize filename to prevent path traversal
  const safeFile = file.replace(/[^a-zA-Z0-9._-]/g, '');
  const validExtension = safeFile.endsWith('.ts') || safeFile.endsWith('.m4s') || safeFile === 'init.mp4';
  if (!validExtension || safeFile.includes('..')) {
    return { error: 'Invalid file', status: 400 };
  }

  const fileIndex = parseInt(fileIndexStr, 10);
  const sessionId = searchParams.get('sessionId');
  const suffix = sessionId ? `_${sessionId}` : '';
  const segmentPath = join(HLS_BASE_DIR, `${infohash}_${fileIndex}${suffix}`, safeFile);

  return { segmentPath, safeFile };
}

/**
 * Get the correct Content-Type for a segment file
 */
function getSegmentContentType(filename: string): string {
  if (filename.endsWith('.m4s') || filename === 'init.mp4') {
    return 'video/mp4';
  }
  return 'video/MP2T';
}

export async function GET(request: NextRequest): Promise<Response> {
  // NOTE: No subscription check here — Safari's native HLS player fetches segments
  // without cookies/auth from the page context. The HLS playlist endpoint is already
  // auth-gated, and segment URLs contain unpredictable infohash values.

  const { searchParams } = new URL(request.url);
  const resolved = resolveSegmentPath(searchParams);
  
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { segmentPath, safeFile } = resolved;

  if (!existsSync(segmentPath)) {
    // Segment may not be ready yet — wait with retries.
    // iOS Safari aborts playback on 404, so we MUST wait long enough
    // for FFmpeg to produce the segment (especially for full transcode).
    // Use shorter poll interval for faster response when segment appears.
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (existsSync(segmentPath)) break;
    }
    if (!existsSync(segmentPath)) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }
  }
  
  // Ensure segment is fully written (not mid-write by FFmpeg).
  // Wait until file size stabilizes (check every 200ms, up to 2s).
  let lastSize = 0;
  for (let i = 0; i < 10; i++) {
    try {
      const currentSize = statSync(segmentPath).size;
      if (currentSize > 0 && currentSize === lastSize) break;
      lastSize = currentSize;
    } catch {
      // File may have been deleted between checks
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Read the complete segment into memory
  const data = readFileSync(segmentPath);
  const contentType = getSegmentContentType(safeFile);

  // Check for Range request (iOS Safari sometimes does partial segment requests)
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : data.length - 1;
      const clampedEnd = Math.min(end, data.length - 1);
      
      if (start <= clampedEnd && start < data.length) {
        const slice = new Uint8Array(data.subarray(start, clampedEnd + 1));
        return new Response(slice, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': slice.length.toString(),
            'Content-Range': `bytes ${start}-${clampedEnd}/${data.length}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
          },
        });
      }
    }
  }

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': data.length.toString(),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    },
  });
}

/**
 * HEAD /api/stream/hls/segment
 * iOS Safari may send HEAD requests to check segment availability
 */
export async function HEAD(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const resolved = resolveSegmentPath(searchParams);
  
  if ('error' in resolved) {
    return new Response(null, { status: resolved.status });
  }

  const { segmentPath, safeFile } = resolved;

  if (!existsSync(segmentPath)) {
    return new Response(null, { status: 404 });
  }

  try {
    const stat = statSync(segmentPath);
    return new Response(null, {
      headers: {
        'Content-Type': getSegmentContentType(safeFile),
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

/**
 * OPTIONS /api/stream/hls/segment
 * Handle CORS preflight requests for iOS Safari
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
    },
  });
}
