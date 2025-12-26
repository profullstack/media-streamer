/**
 * Torrent Files API
 * 
 * GET /api/torrents/[id]/files - Get files for a specific torrent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/torrents/[id]/files
 * 
 * Get all files for a specific torrent.
 * 
 * Response:
 * - 200: List of files
 * - 404: Torrent not found
 * - 500: Server error
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const supabase = getServerClient();

    // First verify the torrent exists
    const { data: torrent, error: torrentError } = await supabase
      .from('torrents')
      .select('id')
      .eq('id', id)
      .single();

    if (torrentError || !torrent) {
      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      );
    }

    // Get files for this torrent
    const { data: files, error: filesError, count } = await supabase
      .from('torrent_files')
      .select('*', { count: 'exact' })
      .eq('torrent_id', id)
      .order('path', { ascending: true });

    if (filesError) {
      console.error('Failed to fetch files:', filesError);
      return NextResponse.json(
        { error: 'Failed to fetch files' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      files: files ?? [],
      total: count ?? 0,
    });
  } catch (error) {
    console.error('Torrent files API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
