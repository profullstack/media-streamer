/**
 * Individual Comment API Route
 *
 * PATCH /api/torrents/:id/comments/:commentId - Update a comment (requires auth, owner only)
 * DELETE /api/torrents/:id/comments/:commentId - Delete a comment (requires auth, owner only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCommentsService } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string; commentId: string }>;
}

/**
 * PATCH /api/torrents/:id/comments/:commentId
 * Update a comment's content
 *
 * Body:
 * - content: string (required)
 */
export async function PATCH(
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
    const body = await request.json() as { content?: string };
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      );
    }

    // Update comment
    const service = getCommentsService();
    const comment = await service.updateComment(commentId, user.id, content);

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('Error updating comment:', error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message === 'Comment not found') {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      if (error.message.includes('Not authorized')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
      if (error.message.includes('cannot be empty') || error.message.includes('exceeds maximum') || error.message.includes('deleted comment')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to update comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/torrents/:id/comments/:commentId
 * Soft delete a comment
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

    // Delete comment
    const service = getCommentsService();
    await service.deleteComment(commentId, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message === 'Comment not found') {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      if (error.message.includes('Not authorized')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
