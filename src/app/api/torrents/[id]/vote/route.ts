/**
 * Torrent Vote API Route
 *
 * GET /api/torrents/:id/vote - Get vote counts, favorites count, and user's vote/favorite status
 * POST /api/torrents/:id/vote - Vote on a torrent (requires auth)
 * DELETE /api/torrents/:id/vote - Remove vote from a torrent (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommentsService, type VoteValue } from '@/lib/comments';
import { getFavoritesService } from '@/lib/favorites';
import { getAuthenticatedUser } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/torrents/:id/vote
 * Get vote counts, favorites count, and user's vote/favorite status if authenticated
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

    const commentsService = getCommentsService();
    const favoritesService = getFavoritesService();

    // Get vote counts
    const counts = await commentsService.getTorrentVoteCounts(torrentId);

    // Get favorites count
    const favoritesCount = await favoritesService.getTorrentFavoritesCount(torrentId);

    // Get user's vote and favorite status if authenticated
    let userVote: VoteValue | null = null;
    let isFavorited = false;
    if (user) {
      const vote = await commentsService.getUserTorrentVote(torrentId, user.id);
      userVote = vote?.voteValue ?? null;
      isFavorited = await favoritesService.isTorrentFavorite(user.id, torrentId);
    }

    return NextResponse.json({
      upvotes: counts.upvotes,
      downvotes: counts.downvotes,
      userVote,
      favoritesCount,
      isFavorited,
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
 *
 * Returns:
 * - vote: The created/updated vote
 * - upvotes: Updated upvote count
 * - downvotes: Updated downvote count
 * - userVote: The user's current vote value
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

    // Fetch updated counts after vote
    const counts = await service.getTorrentVoteCounts(torrentId);

    return NextResponse.json({
      vote,
      upvotes: counts.upvotes,
      downvotes: counts.downvotes,
      userVote: value as VoteValue,
    });
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
 *
 * Returns:
 * - success: true
 * - upvotes: Updated upvote count
 * - downvotes: Updated downvote count
 * - userVote: null (vote removed)
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

    // Fetch updated counts after vote removal
    const counts = await service.getTorrentVoteCounts(torrentId);

    return NextResponse.json({
      success: true,
      upvotes: counts.upvotes,
      downvotes: counts.downvotes,
      userVote: null,
    });
  } catch (error) {
    console.error('Error removing torrent vote:', error);
    return NextResponse.json(
      { error: 'Failed to remove vote' },
      { status: 500 }
    );
  }
}
