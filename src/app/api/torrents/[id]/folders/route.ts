/**
 * Torrent Folders API Route
 *
 * Returns folder-level metadata (cover art, artist, album) for a torrent.
 * Used to display album covers in discography/multi-album torrents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Frontend folder type
 */
interface FolderResponse {
  id: string;
  torrentId: string;
  path: string;
  artist: string | null;
  album: string | null;
  year: number | null;
  coverUrl: string | null;
  externalId: string | null;
  externalSource: string | null;
}

/**
 * Transform database folder to frontend format
 */
function transformFolder(folder: {
  id: string;
  torrent_id: string;
  path: string;
  artist: string | null;
  album: string | null;
  year: number | null;
  cover_url: string | null;
  external_id: string | null;
  external_source: string | null;
}): FolderResponse {
  return {
    id: folder.id,
    torrentId: folder.torrent_id,
    path: folder.path,
    artist: folder.artist,
    album: folder.album,
    year: folder.year,
    coverUrl: folder.cover_url,
    externalId: folder.external_id,
    externalSource: folder.external_source,
  };
}

/**
 * GET /api/torrents/[id]/folders
 *
 * Returns all folder metadata for a torrent
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: torrentId } = await params;

  if (!torrentId) {
    return NextResponse.json(
      { error: 'Torrent ID is required' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('torrent_folders')
    .select('id, torrent_id, path, artist, album, year, cover_url, external_id, external_source')
    .eq('torrent_id', torrentId);

  if (error) {
    console.error('[Folders API] Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch folder metadata' },
      { status: 500 }
    );
  }

  const folders = (data ?? []).map(transformFolder);

  return NextResponse.json({ folders });
}
