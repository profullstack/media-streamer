'use client';

/**
 * Comments Section Component
 *
 * Displays comments for a torrent with voting and reply functionality.
 * Comments are public, but voting/commenting requires authentication.
 */

import { useState, useEffect, useCallback } from 'react';
import { VoteButtons } from './vote-buttons';
import {
  MessageCircleIcon,
  ReplyIcon,
  EditIcon,
  TrashIcon,
  LoadingSpinner,
  UserIcon,
} from '@/components/ui/icons';

interface Comment {
  id: string;
  torrentId: string;
  userId: string;
  content: string;
  parentId: string | null;
  upvotes: number;
  downvotes: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userEmail: string;
  userVote: 1 | -1 | null;
}

interface User {
  id: string;
  email: string;
}

interface CommentsSectionProps {
  /** Torrent ID */
  torrentId: string;
  /** Current authenticated user (null if not logged in) */
  user: User | null;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) {
    return date.toLocaleDateString();
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else {
    return 'just now';
  }
}

/**
 * Get display name from email
 */
function getDisplayName(email: string): string {
  return email.split('@')[0];
}

export function CommentsSection({ torrentId, user }: CommentsSectionProps): React.ReactElement {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [total, setTotal] = useState(0);
  const [isDhtTorrent, setIsDhtTorrent] = useState(false);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/torrents/${torrentId}/comments`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? 'Failed to load comments');
      }

      const data = await response.json() as { comments: Comment[]; total: number; isDhtTorrent?: boolean };
      setComments(data.comments);
      setTotal(data.total);
      setIsDhtTorrent(data.isDhtTorrent ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [torrentId]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  // Submit new comment
  const handleSubmitComment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/torrents/${torrentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to post comment');
      }

      setNewComment('');
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, newComment, isSubmitting, torrentId, fetchComments]);

  // Submit reply
  const handleSubmitReply = useCallback(async (parentId: string) => {
    if (!user || !replyContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/torrents/${torrentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent.trim(), parentId }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to post reply');
      }

      setReplyingTo(null);
      setReplyContent('');
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, replyContent, isSubmitting, torrentId, fetchComments]);

  // Update comment
  const handleUpdateComment = useCallback(async (commentId: string) => {
    if (!user || !editContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/torrents/${torrentId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to update comment');
      }

      setEditingId(null);
      setEditContent('');
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update comment');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, editContent, isSubmitting, torrentId, fetchComments]);

  // Delete comment
  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!user || isSubmitting) return;
    if (!confirm('Are you sure you want to delete this comment?')) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/torrents/${torrentId}/comments/${commentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to delete comment');
      }

      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, isSubmitting, torrentId, fetchComments]);

  // Vote on comment
  const handleVoteOnComment = useCallback(async (commentId: string, value: 1 | -1) => {
    if (!user) return;

    const response = await fetch(`/api/torrents/${torrentId}/comments/${commentId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) {
      throw new Error('Failed to vote');
    }

    // Update local state optimistically
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      
      const prevVote = c.userVote;
      let upvotes = c.upvotes;
      let downvotes = c.downvotes;

      // Remove previous vote
      if (prevVote === 1) upvotes--;
      if (prevVote === -1) downvotes--;

      // Add new vote
      if (value === 1) upvotes++;
      if (value === -1) downvotes++;

      return { ...c, upvotes, downvotes, userVote: value };
    }));
  }, [user, torrentId]);

  // Remove vote from comment
  const handleRemoveCommentVote = useCallback(async (commentId: string) => {
    if (!user) return;

    const response = await fetch(`/api/torrents/${torrentId}/comments/${commentId}/vote`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to remove vote');
    }

    // Update local state
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      
      const prevVote = c.userVote;
      let upvotes = c.upvotes;
      let downvotes = c.downvotes;

      if (prevVote === 1) upvotes--;
      if (prevVote === -1) downvotes--;

      return { ...c, upvotes, downvotes, userVote: null };
    }));
  }, [user, torrentId]);

  // Organize comments into threads
  const rootComments = comments.filter(c => !c.parentId);
  const getReplies = (parentId: string) => comments.filter(c => c.parentId === parentId);

  // Render a single comment
  const renderComment = (comment: Comment, depth: number = 0) => {
    const isOwner = user?.id === comment.userId;
    const isEditing = editingId === comment.id;
    const isReplying = replyingTo === comment.id;
    const replies = getReplies(comment.id);

    return (
      <div key={comment.id} className={`${depth > 0 ? 'ml-6 border-l-2 border-border-subtle pl-4' : ''}`}>
        <div className="py-3">
          {/* Comment header */}
          <div className="flex items-center gap-2 text-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-tertiary">
              <UserIcon size={14} className="text-text-muted" />
            </div>
            <span className="font-medium text-text-primary">
              {getDisplayName(comment.userEmail)}
            </span>
            <span className="text-text-muted">•</span>
            <span className="text-text-muted">
              {formatRelativeTime(comment.createdAt)}
            </span>
            {comment.updatedAt !== comment.createdAt && (
              <span className="text-text-muted">(edited)</span>
            )}
          </div>

          {/* Comment content */}
          {isEditing ? (
            <div className="mt-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg-secondary p-3 text-sm text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none"
                rows={3}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateComment(comment.id)}
                  disabled={isSubmitting || !editContent.trim()}
                  className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setEditContent(''); }}
                  className="rounded-md bg-bg-tertiary px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap">
              {comment.content}
            </p>
          )}

          {/* Comment actions */}
          {!isEditing && (
            <div className="mt-2 flex items-center gap-4">
              <VoteButtons
                upvotes={comment.upvotes}
                downvotes={comment.downvotes}
                userVote={comment.userVote}
                isAuthenticated={!!user}
                onVote={(value) => handleVoteOnComment(comment.id, value)}
                onRemoveVote={() => handleRemoveCommentVote(comment.id)}
                size="sm"
              />

              {user && depth < 2 ? <button
                  type="button"
                  onClick={() => { setReplyingTo(comment.id); setReplyContent(''); }}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
                >
                  <ReplyIcon size={14} />
                  Reply
                </button> : null}

              {isOwner ? <>
                  <button
                    type="button"
                    onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
                  >
                    <EditIcon size={14} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id)}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-red-500"
                  >
                    <TrashIcon size={14} />
                    Delete
                  </button>
                </> : null}
            </div>
          )}

          {/* Reply form */}
          {isReplying ? <div className="mt-3">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="w-full rounded-lg border border-border-subtle bg-bg-secondary p-3 text-sm text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none"
                rows={2}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmitReply(comment.id)}
                  disabled={isSubmitting || !replyContent.trim()}
                  className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                  className="rounded-md bg-bg-tertiary px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary/80"
                >
                  Cancel
                </button>
              </div>
            </div> : null}
        </div>

        {/* Replies */}
        {replies.length > 0 && (
          <div className="mt-1">
            {replies.map(reply => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="border-b border-border-subtle p-4">
        <div className="flex items-center gap-2">
          <MessageCircleIcon size={20} className="text-text-muted" />
          <h2 className="font-semibold text-text-primary">Comments</h2>
          <span className="text-sm text-text-muted">({total})</span>
        </div>
      </div>

      <div className="p-4">
        {/* DHT torrent notice */}
        {isDhtTorrent ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-text-muted">
              <MessageCircleIcon size={32} className="mx-auto mb-3 opacity-50" />
            </div>
            <p className="text-sm text-text-muted">
              Comments are not available for DHT torrents.
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Add this torrent to your library to enable comments.
            </p>
          </div>
        ) : (
          <>
            {/* New comment form */}
            {user ? (
              <form onSubmit={handleSubmitComment} className="mb-6">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="w-full rounded-lg border border-border-subtle bg-bg-secondary p-3 text-sm text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none"
                  rows={3}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting || !newComment.trim()}
                    className="flex items-center gap-2 rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
                  >
                    {isSubmitting ? <LoadingSpinner size={14} /> : null}
                    Post Comment
                  </button>
                </div>
              </form>
            ) : (
              <div className="mb-6 rounded-lg border border-border-subtle bg-bg-secondary p-4 text-center">
                <p className="text-sm text-text-muted">
                  <a href="/login" className="text-accent-primary hover:underline">Log in</a>
                  {' '}to leave a comment
                </p>
              </div>
            )}

            {/* Error message */}
            {error ? <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                {error}
              </div> : null}

            {/* Comments list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size={24} className="text-accent-primary" />
                <span className="ml-2 text-text-muted">Loading comments...</span>
              </div>
            ) : rootComments.length > 0 ? (
              <div className="divide-y divide-border-subtle">
                {rootComments.map(comment => renderComment(comment))}
              </div>
            ) : (
              <div className="py-8 text-center text-text-muted">
                No comments yet. Be the first to comment!
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
