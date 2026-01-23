/**
 * Torrent Comments API Route
 *
 * GET /api/torrents/:id/comments - Get comments for a torrent
 * POST /api/torrents/:id/comments - Create a new comment (requires auth)
 *
 * Note: Comments are only supported for user-submitted torrents (bt_torrents).
 * DHT torrents (identified by infohash) return empty results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommentsService } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Check if a string is a valid UUID v4
 * User torrents use UUIDs, DHT torrents use 40-char hex infohashes
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * GET /api/torrents/:id/comments
 * Get comments for a torrent with optional user vote status
 *
 * Query params:
 * - limit: number (default 50)
 * - offset: number (default 0)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: torrentId } = await params;

    if (!torrentId) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // Parse pagination params
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    // DHT torrents (non-UUID IDs) don't support comments
    // Return empty results instead of failing
    if (!isValidUUID(torrentId)) {
      return NextResponse.json({
        comments: [],
        total: 0,
        limit,
        offset,
        isDhtTorrent: true,
      });
    }

    // Get authenticated user (optional for viewing comments)
    const user = await getAuthenticatedUser(request);
    const userId = user?.id ?? null;

    // Get comments with user vote status
    const service = getCommentsService();
    const [comments, total] = await Promise.all([
      service.getCommentsWithUserVotes(torrentId, userId, limit, offset),
      service.getCommentCount(torrentId),
    ]);

    return NextResponse.json({
      comments,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/torrents/:id/comments
 * Create a new comment on a torrent
 *
 * Body:
 * - content: string (required)
 * - parentId: string (optional, for replies)
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: torrentId } = await params;

    if (!torrentId) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // DHT torrents (non-UUID IDs) don't support comments
    if (!isValidUUID(torrentId)) {
      return NextResponse.json(
        { error: 'Comments are not available for DHT torrents. Add this torrent to your library first.' },
        { status: 400 }
      );
    }

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as { content?: string; parentId?: string };
    const { content, parentId } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      );
    }

    // Create comment
    const service = getCommentsService();
    const comment = await service.createComment(torrentId, user.id, content, parentId);

    return NextResponse.json(
      { comment },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating comment:', error);

    // Handle validation errors
    if (error instanceof Error) {
      if (error.message.includes('cannot be empty') || error.message.includes('exceeds maximum')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
