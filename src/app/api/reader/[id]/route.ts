/**
 * Reader API Route
 *
 * GET /api/reader/[id]
 * Fetches file information for the ebook reader, including torrent info for streaming.
 *
 * FREE - No authentication required to encourage usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

/**
 * File info response type
 */
interface FileInfoResponse {
  file: {
    id: string;
    name: string;
    path: string;
    extension: string;
    size: number;
    mimeType: string;
    fileIndex: number;
  };
  torrent: {
    id: string;
    infohash: string;
    name: string;
    cleanTitle: string | null;
  };
  streamUrl: string;
}

/**
 * Error response type
 */
interface ErrorResponse {
  error: string;
}

/**
 * Database row type for file with torrent join
 */
interface FileWithTorrent {
  id: string;
  torrent_id: string;
  file_index: number;
  path: string;
  name: string;
  extension: string | null;
  size: number;
  media_category: string | null;
  mime_type: string | null;
  torrents: {
    id: string;
    infohash: string;
    name: string;
    clean_title: string | null;
  };
}

/**
 * GET /api/reader/[id]
 * Get file information for the ebook reader
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<FileInfoResponse | ErrorResponse>> {
  const { id } = await params;

  // Validate file ID
  if (!id || id.trim() === '') {
    return NextResponse.json(
      { error: 'File ID is required' },
      { status: 400 }
    );
  }

  const client = getServerClient();

  // Fetch file with torrent info
  const { data: file, error } = await client
    .from('bt_torrent_files')
    .select(`
      id,
      torrent_id,
      file_index,
      path,
      name,
      extension,
      size,
      media_category,
      mime_type,
      torrents (
        id,
        infohash,
        name,
        clean_title
      )
    `)
    .eq('id', id)
    .single();

  // Handle not found
  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    console.error('[Reader API] Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch file information' },
      { status: 500 }
    );
  }

  // Type assertion after validation
  const fileData = file as unknown as FileWithTorrent;

  // Validate file is an ebook
  if (fileData.media_category !== 'ebook') {
    return NextResponse.json(
      { error: 'File is not an ebook' },
      { status: 400 }
    );
  }

  // Build stream URL
  const streamUrl = `/api/stream?infohash=${fileData.torrents.infohash}&fileIndex=${fileData.file_index}`;

  // Return file info
  return NextResponse.json({
    file: {
      id: fileData.id,
      name: fileData.name,
      path: fileData.path,
      extension: fileData.extension ?? '',
      size: fileData.size,
      mimeType: fileData.mime_type ?? 'application/octet-stream',
      fileIndex: fileData.file_index,
    },
    torrent: {
      id: fileData.torrents.id,
      infohash: fileData.torrents.infohash,
      name: fileData.torrents.name,
      cleanTitle: fileData.torrents.clean_title,
    },
    streamUrl,
  });
}
