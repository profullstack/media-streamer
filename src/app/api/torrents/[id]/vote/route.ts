/**
 * Torrent Vote API Route
 *
 * GET /api/torrents/:id/vote - Get vote counts, favorites count, and user's vote/favorite status
 * POST /api/torrents/:id/vote - Vote on a torrent (requires auth)
 * DELETE /api/torrents/:id/vote - Remove vote from a torrent (requires auth)
 *
 * NOTE: Voting and favorites only work for user-submitted torrents (bt_torrents).
 * DHT torrents must be added to the library first before they can be voted/favorited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommentsService, type VoteValue } from '@/lib/comments';
import { getFavoritesService } from '@/lib/favorites';
import { getAuthenticatedUser } from '@/lib/auth';
import { getTorrentById, getTorrentByInfohash } from '@/lib/supabase/queries';

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
 * Verify the torrent exists in bt_torrents and get its UUID
 * Returns null if it's a DHT torrent or doesn't exist
 */
async function getUserTorrentId(id: string): Promise<string | null> {
  // If it's a UUID, check if torrent exists
  if (isUUID(id)) {
    const torrent = await getTorrentById(id);
    return torrent?.id ?? null;
  }

  // If it's an infohash, look up the torrent
  if (isInfohash(id)) {
    const torrent = await getTorrentByInfohash(id);
    return torrent?.id ?? null;
  }

  // Neither UUID nor infohash - try infohash lookup
  const torrent = await getTorrentByInfohash(id);
  return torrent?.id ?? null;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/torrents/:id/vote
 * Get vote counts, favorites count, and user's vote/favorite status if authenticated
 *
 * For DHT torrents (not in bt_torrents), returns zero counts and isDhtTorrent: true
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: torrentIdParam } = await params;

    if (!torrentIdParam) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // Get the user torrent ID (null if DHT torrent)
    const torrentId = await getUserTorrentId(torrentIdParam);

    // If it's a DHT torrent, return empty stats with isDhtTorrent flag
    if (!torrentId) {
      return NextResponse.json({
        upvotes: 0,
        downvotes: 0,
        userVote: null,
        favoritesCount: 0,
        isFavorited: false,
        isDhtTorrent: true,
      });
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
      isDhtTorrent: false,
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
 *
 * NOTE: Only user-submitted torrents can be voted on.
 * DHT torrents must be added to the library first.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: torrentIdParam } = await params;

    if (!torrentIdParam) {
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

    // Get the user torrent ID (null if DHT torrent)
    const torrentId = await getUserTorrentId(torrentIdParam);

    if (!torrentId) {
      return NextResponse.json(
        { error: 'Cannot vote on DHT torrents. Add the torrent to your library first.' },
        { status: 400 }
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
    const { id: torrentIdParam } = await params;

    if (!torrentIdParam) {
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

    // Get the user torrent ID (null if DHT torrent)
    const torrentId = await getUserTorrentId(torrentIdParam);

    if (!torrentId) {
      // DHT torrents can't have votes, so nothing to remove
      return NextResponse.json({
        success: true,
        upvotes: 0,
        downvotes: 0,
        userVote: null,
      });
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
