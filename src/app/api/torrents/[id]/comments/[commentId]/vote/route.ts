/**
 * Comment Vote API Route
 *
 * POST /api/torrents/:id/comments/:commentId/vote - Vote on a comment (requires auth)
 * DELETE /api/torrents/:id/comments/:commentId/vote - Remove vote from a comment (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommentsService, type VoteValue } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string; commentId: string }>;
}

/**
 * POST /api/torrents/:id/comments/:commentId/vote
 * Vote on a comment (upvote or downvote)
 *
 * Body:
 * - value: 1 (upvote) or -1 (downvote)
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: torrentId, commentId } = await params;

    if (!torrentId || !commentId) {
      return NextResponse.json(
        { error: 'Torrent ID and Comment ID are required' },
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
    const vote = await service.voteOnComment(commentId, user.id, value as VoteValue);

    return NextResponse.json({ vote });
  } catch (error) {
    console.error('Error voting on comment:', error);

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
      { error: 'Failed to vote on comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/torrents/:id/comments/:commentId/vote
 * Remove vote from a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: torrentId, commentId } = await params;

    if (!torrentId || !commentId) {
      return NextResponse.json(
        { error: 'Torrent ID and Comment ID are required' },
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
    await service.removeCommentVote(commentId, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing comment vote:', error);
    return NextResponse.json(
      { error: 'Failed to remove vote' },
      { status: 500 }
    );
  }
}
