import { NextRequest, NextResponse } from 'next/server';
import { IndexerService, IndexerError } from '@/lib/indexer';

/**
 * Request body for POST /api/torrents
 */
interface CreateTorrentRequest {
  magnetUri: string;
}

/**
 * Response for successful torrent creation
 */
interface CreateTorrentResponse {
  torrentId: string;
  infohash: string;
  name: string;
  fileCount: number;
  totalSize: number;
  isNew: boolean;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

/**
 * POST /api/torrents
 * 
 * Index a new torrent from a magnet URI.
 * 
 * Request Body:
 * - magnetUri: The magnet URI to index (required)
 * 
 * Returns:
 * - 201: New torrent indexed successfully
 * - 200: Existing torrent returned (already indexed)
 * - 400: Invalid request (missing magnetUri, invalid magnet URI)
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse<CreateTorrentResponse | ErrorResponse>> {
  // Parse request body
  let body: CreateTorrentRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate magnetUri
  const magnetUri = body.magnetUri?.trim();
  if (!magnetUri) {
    return NextResponse.json(
      { error: 'magnetUri is required' },
      { status: 400 }
    );
  }

  // Index the torrent
  const indexer = new IndexerService();
  try {
    const result = await indexer.indexMagnet(magnetUri);

    // Return 201 for new torrents, 200 for existing
    const status = result.isNew ? 201 : 200;

    return NextResponse.json(
      {
        torrentId: result.torrentId,
        infohash: result.infohash,
        name: result.name,
        fileCount: result.fileCount,
        totalSize: result.totalSize,
        isNew: result.isNew,
      },
      { status }
    );
  } catch (error) {
    // Handle IndexerError (invalid magnet URI, etc.)
    if (error instanceof IndexerError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Handle unexpected errors
    console.error('Torrent indexing error:', error);
    return NextResponse.json(
      { error: 'Failed to index torrent' },
      { status: 500 }
    );
  } finally {
    // Clean up indexer resources
    await indexer.destroy();
  }
}
