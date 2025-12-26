/**
 * Stream Session API
 * 
 * POST /api/stream/session - Create a new stream session
 * GET /api/stream/session - Get session details
 * DELETE /api/stream/session - Destroy a session
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createStreamSession,
  getStreamSession,
  destroyStreamSession,
  validateStreamRequest,
  StreamSessionError,
} from '@/lib/stream-from-search';

/**
 * POST /api/stream/session
 * 
 * Create a new stream session for a file.
 * 
 * Request body:
 * - torrentId: string (required)
 * - filePath: string (required)
 * - infohash: string (required)
 * 
 * Response:
 * - 201: Session created
 * - 400: Invalid request
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { torrentId, filePath, infohash } = body as {
    torrentId?: string;
    filePath?: string;
    infohash?: string;
  };

  // Validate required fields
  if (!torrentId || typeof torrentId !== 'string' || torrentId.trim() === '') {
    return NextResponse.json(
      { error: 'torrentId is required' },
      { status: 400 }
    );
  }

  if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
    return NextResponse.json(
      { error: 'filePath is required' },
      { status: 400 }
    );
  }

  if (!infohash || typeof infohash !== 'string' || infohash.trim() === '') {
    return NextResponse.json(
      { error: 'infohash is required' },
      { status: 400 }
    );
  }

  // Validate stream request
  const validation = validateStreamRequest({ torrentId, filePath });
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  try {
    const session = await createStreamSession({
      torrentId,
      filePath,
      infohash,
    });

    return NextResponse.json(
      {
        sessionId: session.id,
        torrentId: session.torrentId,
        filePath: session.filePath,
        status: session.status,
        createdAt: session.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof StreamSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Failed to create stream session:', error);
    return NextResponse.json(
      { error: 'Failed to create stream session' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/stream/session
 * 
 * Get details of an existing stream session.
 * 
 * Query parameters:
 * - sessionId: string (required)
 * 
 * Response:
 * - 200: Session details
 * - 400: Missing sessionId
 * - 404: Session not found
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 }
    );
  }

  const session = getStreamSession(sessionId);

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    sessionId: session.id,
    torrentId: session.torrentId,
    filePath: session.filePath,
    infohash: session.infohash,
    status: session.status,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
  });
}

/**
 * DELETE /api/stream/session
 * 
 * Destroy a stream session and cleanup resources.
 * 
 * Query parameters:
 * - sessionId: string (required)
 * 
 * Response:
 * - 204: Session destroyed
 * - 400: Missing sessionId
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 }
    );
  }

  await destroyStreamSession(sessionId);

  // Return 204 No Content (idempotent)
  return new NextResponse(null, { status: 204 });
}
