/**
 * Torrent Vote API Route
 *
 * GET /api/torrents/:id/vote - Get vote counts and user's vote (if authenticated)
 * POST /api/torrents/:id/vote - Vote on a torrent (requires auth)
 * DELETE /api/torrents/:id/vote - Remove vote from a torrent (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommentsService, type VoteValue } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/torrents/:id/vote
 * Get vote counts for a torrent and user's vote if authenticated
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

    // Get authenticated user (optional)
    const user = await getAuthenticatedUser(request);

    const service = getCommentsService();

    // Get vote counts
    const counts = await service.getTorrentVoteCounts(torrentId);

    // Get user's vote if authenticated
    let userVote: VoteValue | null = null;
    if (user) {
      const vote = await service.getUserTorrentVote(torrentId, user.id);
      userVote = vote?.voteValue ?? null;
    }

    return NextResponse.json({
      upvotes: counts.upvotes,
      downvotes: counts.downvotes,
      userVote,
    });
  } catch (error) {
    console.error('Error fetching torrent votes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch votes' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/torrents/:id/vote
 * Vote on a torrent (upvote or downvote)
 *
 * Body:
 * - value: 1 (upvote) or -1 (downvote)
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

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as { value?: number };
    const { value } = body;

    if (value !== 1 && value !== -1) {
      return NextResponse.json(
        { error: 'Vote value must be 1 (upvote) or -1 (downvote)' },
        { status: 400 }
      );
    }

    // Create/update vote
    const service = getCommentsService();
    const vote = await service.voteOnTorrent(torrentId, user.id, value as VoteValue);

    return NextResponse.json({ vote });
  } catch (error) {
    console.error('Error voting on torrent:', error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('Invalid vote value')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to vote on torrent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/torrents/:id/vote
 * Remove vote from a torrent
 */
export async function DELETE(
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

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Remove vote
    const service = getCommentsService();
    await service.removeTorrentVote(torrentId, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing torrent vote:', error);
    return NextResponse.json(
      { error: 'Failed to remove vote' },
      { status: 500 }
    );
  }
}
