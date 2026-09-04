/**
 * GET /api/spotify/stream/{index.m3u8 | seg_00042.ts}
 *
 * Serves the current user's own HLS output. The playlist ffmpeg writes uses
 * relative segment names, so the manifest and its segments must share a URL
 * prefix; a path segment (not a query param) is what makes hls.js resolve
 * them against this route. Only the two filename shapes ffmpeg produces are
 * served, which is also what keeps the path from ever leaving the HLS dir.
 */

import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSpotifyPlayerManager } from '@/lib/spotify';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> }
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { file } = await context.params;
  const path = getSpotifyPlayerManager().hlsPath(user.id, file);
  if (!path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: Buffer;
  try {
    body = await readFile(path);
  } catch {
    return NextResponse.json(
      { error: file.endsWith('.m3u8') ? 'Nothing is playing yet' : 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const isPlaylist = file.endsWith('.m3u8');
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      // The playlist changes every segment; a segment never changes.
      'Cache-Control': isPlaylist ? 'no-store' : 'private, max-age=60',
      'Content-Length': String(body.byteLength),
    },
  });
}
