/**
 * GET /api/v1/nixamp/files/:grant — one file, for the Nixamp server a member
 * handed it to.
 *
 * No session: the caller is the member's own Nixamp server, copying what they
 * chose. The grant is the whole permission -- one file, until it expires,
 * minted only by POST /api/v1/nixamp/handoffs for a signed-in member -- so a
 * leaked grant opens that one file for a few hours and nothing else, and a
 * forged or expired one is the same 403 as a missing file is a 404.
 */

import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { getStreamingService } from '@/lib/streaming';
import { getServerClient } from '@/lib/supabase/client';
import { verifyFileGrant } from '@/lib/nixamp/handoff';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ grant: string }> }): Promise<Response> {
  const { grant } = await params;
  const claims = await verifyFileGrant(grant);
  if (!claims) return NextResponse.json({ error: 'this link has expired or is not valid' }, { status: 403 });

  const db = getServerClient();
  const { data: file } = await db
    .from('bt_torrent_files')
    .select('id, file_index, size, mime_type, torrent_id, bt_torrents!inner(infohash, magnet_uri)')
    .eq('id', claims.fileId)
    .eq('torrent_id', claims.torrentId)
    .maybeSingle();
  if (!file) return NextResponse.json({ error: 'no such file' }, { status: 404 });
  const torrent = (file as unknown as { bt_torrents: { infohash: string; magnet_uri: string | null } }).bt_torrents;
  const magnetUri = torrent.magnet_uri || `magnet:?xt=urn:btih:${torrent.infohash}`;

  try {
    const result = await getStreamingService().createStream({ magnetUri, fileIndex: Number(file.file_index) });
    return new Response(Readable.toWeb(result.stream) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        'content-type': result.mimeType || String(file.mime_type || 'application/octet-stream'),
        'content-length': String(result.size),
        'cache-control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'that file is not available right now' }, { status: 503 });
  }
}
