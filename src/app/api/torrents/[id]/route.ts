/**
 * Torrent Detail API Route
 *
 * GET /api/torrents/:id - Get torrent details with files (supports UUID or infohash)
 * DELETE /api/torrents/:id - Delete a torrent (supports UUID or infohash)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTorrentById, getTorrentByInfohash, getTorrentFiles, deleteTorrent } from '@/lib/supabase/queries';
import { transformTorrent, transformTorrentFiles } from '@/lib/transforms';
import type { Torrent } from '@/lib/supabase/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Check if a string is a valid UUID v4
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Check if a string is a valid infohash (40 hex characters)
 */
function isInfohash(str: string): boolean {
  const infohashRegex = /^[0-9a-f]{40}$/i;
  return infohashRegex.test(str);
}

/**
 * Get torrent by either UUID or infohash
 */
async function getTorrent(id: string): Promise<Torrent | null> {
  if (isUUID(id)) {
    return getTorrentById(id);
  } else if (isInfohash(id)) {
    return getTorrentByInfohash(id);
  }
  // If neither, try infohash first (more common in URLs)
  return getTorrentByInfohash(id);
}

/**
 * GET /api/torrents/:id
 * Get torrent details with all files
 * Accepts either UUID or infohash as the ID parameter
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // Get torrent by UUID or infohash
    const torrent = await getTorrent(id);

    if (!torrent) {
      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      );
    }

    // Get files using the torrent's UUID
    const files = await getTorrentFiles(torrent.id);

    // Transform to camelCase for frontend
    return NextResponse.json({
      torrent: transformTorrent(torrent),
      files: transformTorrentFiles(files),
    });
  } catch (error) {
    console.error('Error fetching torrent:', error);
    return NextResponse.json(
      { error: 'Failed to fetch torrent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/torrents/:id
 * Delete a torrent and all its files
 * Accepts either UUID or infohash as the ID parameter
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // Get torrent by UUID or infohash
    const torrent = await getTorrent(id);

    if (!torrent) {
      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      );
    }

    // Delete torrent using UUID (cascade will delete files)
    await deleteTorrent(torrent.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting torrent:', error);
    return NextResponse.json(
      { error: 'Failed to delete torrent' },
      { status: 500 }
    );
  }
}
