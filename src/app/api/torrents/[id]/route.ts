/**
 * Torrent Detail API Route
 * 
 * GET /api/torrents/:id - Get torrent details with files
 * DELETE /api/torrents/:id - Delete a torrent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTorrentById, getTorrentFiles, deleteTorrent } from '@/lib/supabase/queries';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/torrents/:id
 * Get torrent details with all files
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

    // Get torrent
    const torrent = await getTorrentById(id);

    if (!torrent) {
      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      );
    }

    // Get files
    const files = await getTorrentFiles(id);

    return NextResponse.json({
      torrent,
      files,
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

    // Check if torrent exists
    const torrent = await getTorrentById(id);

    if (!torrent) {
      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      );
    }

    // Delete torrent (cascade will delete files)
    await deleteTorrent(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting torrent:', error);
    return NextResponse.json(
      { error: 'Failed to delete torrent' },
      { status: 500 }
    );
  }
}
