/**
 * Comments Repository
 *
 * Server-side repository for managing comments and votes in Supabase.
 * All operations are performed server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  TorrentComment,
  TorrentCommentInsert,
  CommentVote as CommentVoteType,
  TorrentVote as TorrentVoteType,
  VoteValue,
} from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

export type { VoteValue };

/**
 * Comment row from database
 */
export type CommentRow = TorrentComment;

/**
 * Comment with user email from join
 */
export interface CommentWithUserRow extends CommentRow {
  user_email: string;
}

/**
 * Comment vote row from database
 */
export type CommentVoteRow = CommentVoteType;

/**
 * Torrent vote row from database
 */
export type TorrentVoteRow = TorrentVoteType;

/**
 * Comment insert data
 */
export interface CommentInsert {
  torrent_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
}

/**
 * Vote counts
 */
export interface VoteCounts {
  upvotes: number;
  downvotes: number;
}

/**
 * Comments repository interface
 */
export interface CommentsRepository {
  // Comment operations
  getCommentById(id: string): Promise<CommentRow | null>;
  getCommentsByTorrentId(torrentId: string, limit?: number, offset?: number): Promise<CommentWithUserRow[]>;
  createComment(data: CommentInsert): Promise<CommentRow>;
  updateComment(id: string, content: string): Promise<CommentRow>;
  deleteComment(id: string): Promise<void>;
  getCommentCount(torrentId: string): Promise<number>;

  // Comment vote operations
  getCommentVote(commentId: string, userId: string): Promise<CommentVoteRow | null>;
  upsertCommentVote(commentId: string, userId: string, voteValue: VoteValue): Promise<CommentVoteRow>;
  deleteCommentVote(commentId: string, userId: string): Promise<void>;
  getUserCommentVotes(torrentId: string, userId: string): Promise<CommentVoteRow[]>;

  // Torrent vote operations
  getTorrentVote(torrentId: string, userId: string): Promise<TorrentVoteRow | null>;
  upsertTorrentVote(torrentId: string, userId: string, voteValue: VoteValue): Promise<TorrentVoteRow>;
  deleteTorrentVote(torrentId: string, userId: string): Promise<void>;
  getTorrentVoteCounts(torrentId: string): Promise<VoteCounts>;
  getUserTorrentVote(torrentId: string, userId: string): Promise<TorrentVoteRow | null>;
}

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Create a comments repository instance
 */
export function createCommentsRepository(
  client: SupabaseClient<Database>
): CommentsRepository {
  return {
    /**
     * Get comment by ID
     */
    async getCommentById(id: string): Promise<CommentRow | null> {
      const { data, error } = await client
        .from('torrent_comments')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Get comments for a torrent with user info
     */
    async getCommentsByTorrentId(
      torrentId: string,
      limit: number = 50,
      offset: number = 0
    ): Promise<CommentWithUserRow[]> {
      // First get comments
      const { data: comments, error: commentsError } = await client
        .from('torrent_comments')
        .select('*')
        .eq('torrent_id', torrentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (commentsError) {
        throw new Error(commentsError.message);
      }

      if (!comments || comments.length === 0) {
        return [];
      }

      // For now, we'll return comments with a placeholder email
      // In production, you'd want to create an RPC function or store user info
      return comments.map(comment => ({
        ...comment,
        user_email: 'user@example.com', // Placeholder - will be replaced with actual user lookup
      }));
    },

    /**
     * Create a new comment
     */
    async createComment(data: CommentInsert): Promise<CommentRow> {
      const { data: comment, error } = await client
        .from('torrent_comments')
        .insert({
          torrent_id: data.torrent_id,
          user_id: data.user_id,
          content: data.content,
          parent_id: data.parent_id,
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return comment;
    },

    /**
     * Update comment content
     */
    async updateComment(id: string, content: string): Promise<CommentRow> {
      const { data: comment, error } = await client
        .from('torrent_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return comment;
    },

    /**
     * Soft delete a comment
     */
    async deleteComment(id: string): Promise<void> {
      const { error } = await client
        .from('torrent_comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        throw new Error(error.message);
      }
    },

    /**
     * Get comment count for a torrent
     */
    async getCommentCount(torrentId: string): Promise<number> {
      const { count, error } = await client
        .from('torrent_comments')
        .select('*', { count: 'exact', head: true })
        .eq('torrent_id', torrentId)
        .is('deleted_at', null);

      if (error) {
        throw new Error(error.message);
      }

      return count ?? 0;
    },

    /**
     * Get a user's vote on a comment
     */
    async getCommentVote(commentId: string, userId: string): Promise<CommentVoteRow | null> {
      const { data, error } = await client
        .from('comment_votes')
        .select('*')
        .eq('comment_id', commentId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Create or update a comment vote
     */
    async upsertCommentVote(
      commentId: string,
      userId: string,
      voteValue: VoteValue
    ): Promise<CommentVoteRow> {
      const { data, error } = await client
        .from('comment_votes')
        .upsert(
          {
            comment_id: commentId,
            user_id: userId,
            vote_value: voteValue,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'comment_id,user_id' }
        )
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Delete a comment vote
     */
    async deleteCommentVote(commentId: string, userId: string): Promise<void> {
      const { error } = await client
        .from('comment_votes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    },

    /**
     * Get all user votes for comments on a torrent
     */
    async getUserCommentVotes(torrentId: string, userId: string): Promise<CommentVoteRow[]> {
      // First get comment IDs for this torrent
      const { data: comments, error: commentsError } = await client
        .from('torrent_comments')
        .select('id')
        .eq('torrent_id', torrentId);

      if (commentsError) {
        throw new Error(commentsError.message);
      }

      if (!comments || comments.length === 0) {
        return [];
      }

      const commentIds = comments.map(c => c.id);

      // Get user's votes for these comments
      const { data: votes, error: votesError } = await client
        .from('comment_votes')
        .select('*')
        .eq('user_id', userId)
        .in('comment_id', commentIds);

      if (votesError) {
        throw new Error(votesError.message);
      }

      return votes ?? [];
    },

    /**
     * Get a user's vote on a torrent
     */
    async getTorrentVote(torrentId: string, userId: string): Promise<TorrentVoteRow | null> {
      const { data, error } = await client
        .from('torrent_votes')
        .select('*')
        .eq('torrent_id', torrentId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Create or update a torrent vote
     */
    async upsertTorrentVote(
      torrentId: string,
      userId: string,
      voteValue: VoteValue
    ): Promise<TorrentVoteRow> {
      const { data, error } = await client
        .from('torrent_votes')
        .upsert(
          {
            torrent_id: torrentId,
            user_id: userId,
            vote_value: voteValue,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'torrent_id,user_id' }
        )
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Delete a torrent vote
     */
    async deleteTorrentVote(torrentId: string, userId: string): Promise<void> {
      const { error } = await client
        .from('torrent_votes')
        .delete()
        .eq('torrent_id', torrentId)
        .eq('user_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    },

    /**
     * Get vote counts for a torrent
     */
    async getTorrentVoteCounts(torrentId: string): Promise<VoteCounts> {
      const { data, error } = await client
        .from('torrents')
        .select('upvotes, downvotes')
        .eq('id', torrentId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { upvotes: 0, downvotes: 0 };
        }
        throw new Error(error.message);
      }

      return {
        upvotes: data.upvotes ?? 0,
        downvotes: data.downvotes ?? 0,
      };
    },

    /**
     * Get user's vote on a torrent
     */
    async getUserTorrentVote(torrentId: string, userId: string): Promise<TorrentVoteRow | null> {
      return this.getTorrentVote(torrentId, userId);
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getServerClient } from '../supabase/client';

let repositoryInstance: CommentsRepository | null = null;

/**
 * Get the singleton comments repository instance
 * Uses the server-side Supabase client
 */
export function getCommentsRepository(): CommentsRepository {
  if (!repositoryInstance) {
    repositoryInstance = createCommentsRepository(getServerClient());
  }
  return repositoryInstance;
}

/**
 * Reset the repository instance (for testing)
 */
export function resetCommentsRepository(): void {
  repositoryInstance = null;
}
