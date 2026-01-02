/**
 * Comments and Votes Service
 *
 * Server-side service for managing torrent comments and voting.
 * All operations are performed server-side only.
 */

import type {
  CommentsRepository,
  CommentRow,
  CommentWithUserRow,
  CommentVoteRow,
  TorrentVoteRow,
  VoteCounts,
  VoteValue,
} from './repository';

// ============================================================================
// Types
// ============================================================================

export type { VoteValue };

/**
 * Comment domain model
 */
export interface Comment {
  id: string;
  torrentId: string;
  userId: string;
  content: string;
  parentId: string | null;
  upvotes: number;
  downvotes: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Comment with user info
 */
export interface CommentWithUser extends Comment {
  userEmail: string;
}

/**
 * Comment with user vote status
 */
export interface CommentWithUserVote extends CommentWithUser {
  userVote: VoteValue | null;
}

/**
 * Comment vote domain model
 */
export interface CommentVote {
  id: string;
  commentId: string;
  userId: string;
  voteValue: VoteValue;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Torrent vote domain model
 */
export interface TorrentVote {
  id: string;
  torrentId: string;
  userId: string;
  voteValue: VoteValue;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_COMMENT_LENGTH = 10000;
const DEFAULT_COMMENTS_LIMIT = 50;

// ============================================================================
// Mappers
// ============================================================================

function mapCommentRowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    torrentId: row.torrent_id,
    userId: row.user_id,
    content: row.content,
    parentId: row.parent_id,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapCommentWithUserRowToCommentWithUser(row: CommentWithUserRow): CommentWithUser {
  return {
    ...mapCommentRowToComment(row),
    userEmail: row.user_email,
  };
}

function mapCommentVoteRowToCommentVote(row: CommentVoteRow): CommentVote {
  return {
    id: row.id,
    commentId: row.comment_id,
    userId: row.user_id,
    voteValue: row.vote_value as VoteValue,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapTorrentVoteRowToTorrentVote(row: TorrentVoteRow): TorrentVote {
  return {
    id: row.id,
    torrentId: row.torrent_id,
    userId: row.user_id,
    voteValue: row.vote_value as VoteValue,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Comments service interface
 */
export interface CommentsService {
  // Comment operations
  getCommentsByTorrentId(torrentId: string, limit?: number, offset?: number): Promise<CommentWithUser[]>;
  createComment(torrentId: string, userId: string, content: string, parentId?: string): Promise<Comment>;
  updateComment(commentId: string, userId: string, content: string): Promise<Comment>;
  deleteComment(commentId: string, userId: string): Promise<void>;
  getCommentCount(torrentId: string): Promise<number>;

  // Comment vote operations
  voteOnComment(commentId: string, userId: string, voteValue: VoteValue): Promise<CommentVote>;
  removeCommentVote(commentId: string, userId: string): Promise<void>;
  getUserCommentVotes(torrentId: string, userId: string): Promise<CommentVote[]>;

  // Torrent vote operations
  voteOnTorrent(torrentId: string, userId: string, voteValue: VoteValue): Promise<TorrentVote>;
  removeTorrentVote(torrentId: string, userId: string): Promise<void>;
  getTorrentVoteCounts(torrentId: string): Promise<VoteCounts>;
  getUserTorrentVote(torrentId: string, userId: string): Promise<TorrentVote | null>;

  // Combined operations
  getCommentsWithUserVotes(torrentId: string, userId: string | null, limit?: number, offset?: number): Promise<CommentWithUserVote[]>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a comments service instance
 */
export function createCommentsService(repository: CommentsRepository): CommentsService {
  return {
    /**
     * Get comments for a torrent
     */
    async getCommentsByTorrentId(
      torrentId: string,
      limit: number = DEFAULT_COMMENTS_LIMIT,
      offset: number = 0
    ): Promise<CommentWithUser[]> {
      const rows = await repository.getCommentsByTorrentId(torrentId, limit, offset);
      return rows.map(mapCommentWithUserRowToCommentWithUser);
    },

    /**
     * Create a new comment
     */
    async createComment(
      torrentId: string,
      userId: string,
      content: string,
      parentId?: string
    ): Promise<Comment> {
      // Validate content
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error('Comment content cannot be empty');
      }
      if (trimmedContent.length > MAX_COMMENT_LENGTH) {
        throw new Error('Comment content exceeds maximum length');
      }

      const row = await repository.createComment({
        torrent_id: torrentId,
        user_id: userId,
        content: trimmedContent,
        parent_id: parentId ?? null,
      });

      return mapCommentRowToComment(row);
    },

    /**
     * Update a comment
     */
    async updateComment(
      commentId: string,
      userId: string,
      content: string
    ): Promise<Comment> {
      // Get existing comment
      const existingRow = await repository.getCommentById(commentId);
      if (!existingRow) {
        throw new Error('Comment not found');
      }

      // Check ownership
      if (existingRow.user_id !== userId) {
        throw new Error('Not authorized to update this comment');
      }

      // Check if deleted
      if (existingRow.deleted_at) {
        throw new Error('Cannot update a deleted comment');
      }

      // Validate content
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error('Comment content cannot be empty');
      }
      if (trimmedContent.length > MAX_COMMENT_LENGTH) {
        throw new Error('Comment content exceeds maximum length');
      }

      const row = await repository.updateComment(commentId, trimmedContent);
      return mapCommentRowToComment(row);
    },

    /**
     * Delete a comment (soft delete)
     */
    async deleteComment(commentId: string, userId: string): Promise<void> {
      // Get existing comment
      const existingRow = await repository.getCommentById(commentId);
      if (!existingRow) {
        throw new Error('Comment not found');
      }

      // Check ownership
      if (existingRow.user_id !== userId) {
        throw new Error('Not authorized to delete this comment');
      }

      await repository.deleteComment(commentId);
    },

    /**
     * Get comment count for a torrent
     */
    async getCommentCount(torrentId: string): Promise<number> {
      return repository.getCommentCount(torrentId);
    },

    /**
     * Vote on a comment
     */
    async voteOnComment(
      commentId: string,
      userId: string,
      voteValue: VoteValue
    ): Promise<CommentVote> {
      // Validate vote value
      if (voteValue !== 1 && voteValue !== -1) {
        throw new Error('Invalid vote value');
      }

      const row = await repository.upsertCommentVote(commentId, userId, voteValue);
      return mapCommentVoteRowToCommentVote(row);
    },

    /**
     * Remove a vote from a comment
     */
    async removeCommentVote(commentId: string, userId: string): Promise<void> {
      await repository.deleteCommentVote(commentId, userId);
    },

    /**
     * Get user's votes on comments for a torrent
     */
    async getUserCommentVotes(torrentId: string, userId: string): Promise<CommentVote[]> {
      const rows = await repository.getUserCommentVotes(torrentId, userId);
      return rows.map(mapCommentVoteRowToCommentVote);
    },

    /**
     * Vote on a torrent
     */
    async voteOnTorrent(
      torrentId: string,
      userId: string,
      voteValue: VoteValue
    ): Promise<TorrentVote> {
      // Validate vote value
      if (voteValue !== 1 && voteValue !== -1) {
        throw new Error('Invalid vote value');
      }

      const row = await repository.upsertTorrentVote(torrentId, userId, voteValue);
      return mapTorrentVoteRowToTorrentVote(row);
    },

    /**
     * Remove a vote from a torrent
     */
    async removeTorrentVote(torrentId: string, userId: string): Promise<void> {
      await repository.deleteTorrentVote(torrentId, userId);
    },

    /**
     * Get vote counts for a torrent
     */
    async getTorrentVoteCounts(torrentId: string): Promise<VoteCounts> {
      return repository.getTorrentVoteCounts(torrentId);
    },

    /**
     * Get user's vote on a torrent
     */
    async getUserTorrentVote(torrentId: string, userId: string): Promise<TorrentVote | null> {
      const row = await repository.getUserTorrentVote(torrentId, userId);
      return row ? mapTorrentVoteRowToTorrentVote(row) : null;
    },

    /**
     * Get comments with user vote status
     */
    async getCommentsWithUserVotes(
      torrentId: string,
      userId: string | null,
      limit: number = DEFAULT_COMMENTS_LIMIT,
      offset: number = 0
    ): Promise<CommentWithUserVote[]> {
      const comments = await this.getCommentsByTorrentId(torrentId, limit, offset);

      if (!userId) {
        // No user logged in, return comments without vote status
        return comments.map(comment => ({
          ...comment,
          userVote: null,
        }));
      }

      // Get user's votes for these comments
      const userVotes = await this.getUserCommentVotes(torrentId, userId);
      const voteMap = new Map(userVotes.map(v => [v.commentId, v.voteValue]));

      return comments.map(comment => ({
        ...comment,
        userVote: voteMap.get(comment.id) ?? null,
      }));
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getCommentsRepository } from './repository';

let serviceInstance: CommentsService | null = null;

/**
 * Get the singleton comments service instance
 */
export function getCommentsService(): CommentsService {
  if (!serviceInstance) {
    serviceInstance = createCommentsService(getCommentsRepository());
  }
  return serviceInstance;
}

/**
 * Reset the service instance (for testing)
 */
export function resetCommentsService(): void {
  serviceInstance = null;
}
