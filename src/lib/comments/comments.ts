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
  /** Thread key — shared by DHT and indexed views of the same torrent */
  infohash: string;
  /** Set only when the torrent is present in bt_torrents */
  torrentId: string | null;
  profileId: string;
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
  /** Author's profile name, or 'Anonymous' */
  authorName: string;
  authorAvatarEmoji: string | null;
}

/**
 * Comment with user vote status
 */
export interface CommentWithUserVote extends CommentWithUser {
  userVote: VoteValue | null;
}

/**
 * Arguments for creating a comment
 */
export interface CreateCommentInput {
  /** 40-char infohash of the torrent being commented on */
  infohash: string;
  /** bt_torrents UUID when the torrent is indexed, null for DHT-only torrents */
  torrentId?: string | null;
  profileId: string;
  content: string;
  parentId?: string;
}

/**
 * Comment vote domain model
 */
export interface CommentVote {
  id: string;
  commentId: string;
  profileId: string;
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
  profileId: string;
  voteValue: VoteValue;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_COMMENT_LENGTH = 10000;
const DEFAULT_COMMENTS_LIMIT = 50;
const INFOHASH_REGEX = /^[0-9a-f]{40}$/i;

// ============================================================================
// Mappers
// ============================================================================

function mapCommentRowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    infohash: (row as any).infohash,
    torrentId: row.torrent_id,
    profileId: (row as any).profile_id || row.user_id, // Fallback during migration
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
    authorName: row.author_name,
    authorAvatarEmoji: row.author_avatar_emoji,
  };
}

function mapCommentVoteRowToCommentVote(row: CommentVoteRow): CommentVote {
  return {
    id: row.id,
    commentId: row.comment_id,
    profileId: (row as any).profile_id || row.user_id, // Fallback during migration
    voteValue: row.vote_value as VoteValue,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapTorrentVoteRowToTorrentVote(row: TorrentVoteRow): TorrentVote {
  return {
    id: row.id,
    torrentId: row.torrent_id,
    profileId: (row as any).profile_id || row.user_id, // Fallback during migration
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
  getCommentsByInfohash(infohash: string, limit?: number, offset?: number): Promise<CommentWithUser[]>;
  createComment(input: CreateCommentInput): Promise<Comment>;
  updateComment(commentId: string, profileId: string, content: string): Promise<Comment>;
  deleteComment(commentId: string, profileId: string): Promise<void>;
  getCommentCount(infohash: string): Promise<number>;

  // Comment vote operations
  voteOnComment(commentId: string, profileId: string, voteValue: VoteValue): Promise<CommentVote>;
  removeCommentVote(commentId: string, profileId: string): Promise<void>;
  getUserCommentVotes(infohash: string, profileId: string): Promise<CommentVote[]>;

  // Torrent vote operations
  voteOnTorrent(torrentId: string, profileId: string, voteValue: VoteValue): Promise<TorrentVote>;
  removeTorrentVote(torrentId: string, profileId: string): Promise<void>;
  getTorrentVoteCounts(torrentId: string): Promise<VoteCounts>;
  getUserTorrentVote(torrentId: string, profileId: string): Promise<TorrentVote | null>;

  // Combined operations
  getCommentsWithUserVotes(infohash: string, profileId: string | null, limit?: number, offset?: number): Promise<CommentWithUserVote[]>;
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
    async getCommentsByInfohash(
      infohash: string,
      limit: number = DEFAULT_COMMENTS_LIMIT,
      offset: number = 0
    ): Promise<CommentWithUser[]> {
      const rows = await repository.getCommentsByInfohash(infohash, limit, offset);
      return rows.map(mapCommentWithUserRowToCommentWithUser);
    },

    /**
     * Create a new comment
     */
    async createComment(input: CreateCommentInput): Promise<Comment> {
      const { infohash, torrentId, profileId, content, parentId } = input;

      if (!INFOHASH_REGEX.test(infohash)) {
        throw new Error('Invalid infohash');
      }

      // Validate content
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error('Comment content cannot be empty');
      }
      if (trimmedContent.length > MAX_COMMENT_LENGTH) {
        throw new Error('Comment content exceeds maximum length');
      }

      // A reply must belong to the thread it claims to be in, otherwise a
      // parentId from another torrent would silently graft comments across threads.
      if (parentId) {
        const parent = await repository.getCommentById(parentId);
        if (!parent || (parent as { infohash?: string }).infohash?.toLowerCase() !== infohash.toLowerCase()) {
          throw new Error('Parent comment not found');
        }
      }

      const row = await repository.createComment({
        infohash: infohash.toLowerCase(),
        torrent_id: torrentId ?? null,
        profile_id: profileId,
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
      profileId: string,
      content: string
    ): Promise<Comment> {
      // Get existing comment
      const existingRow = await repository.getCommentById(commentId);
      if (!existingRow) {
        throw new Error('Comment not found');
      }

      // Check ownership
      if (((existingRow as any).profile_id || existingRow.user_id) !== profileId) {
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
    async deleteComment(commentId: string, profileId: string): Promise<void> {
      // Get existing comment
      const existingRow = await repository.getCommentById(commentId);
      if (!existingRow) {
        throw new Error('Comment not found');
      }

      // Check ownership
      if (((existingRow as any).profile_id || existingRow.user_id) !== profileId) {
        throw new Error('Not authorized to delete this comment');
      }

      await repository.deleteComment(commentId);
    },

    /**
     * Get comment count for a torrent
     */
    async getCommentCount(infohash: string): Promise<number> {
      return repository.getCommentCount(infohash);
    },

    /**
     * Vote on a comment
     */
    async voteOnComment(
      commentId: string,
      profileId: string,
      voteValue: VoteValue
    ): Promise<CommentVote> {
      // Validate vote value
      if (voteValue !== 1 && voteValue !== -1) {
        throw new Error('Invalid vote value');
      }

      const row = await repository.upsertCommentVote(commentId, profileId, voteValue);
      return mapCommentVoteRowToCommentVote(row);
    },

    /**
     * Remove a vote from a comment
     */
    async removeCommentVote(commentId: string, profileId: string): Promise<void> {
      await repository.deleteCommentVote(commentId, profileId);
    },

    /**
     * Get user's votes on comments for a torrent
     */
    async getUserCommentVotes(infohash: string, profileId: string): Promise<CommentVote[]> {
      const rows = await repository.getUserCommentVotes(infohash, profileId);
      return rows.map(mapCommentVoteRowToCommentVote);
    },

    /**
     * Vote on a torrent
     */
    async voteOnTorrent(
      torrentId: string,
      profileId: string,
      voteValue: VoteValue
    ): Promise<TorrentVote> {
      // Validate vote value
      if (voteValue !== 1 && voteValue !== -1) {
        throw new Error('Invalid vote value');
      }

      const row = await repository.upsertTorrentVote(torrentId, profileId, voteValue);
      return mapTorrentVoteRowToTorrentVote(row);
    },

    /**
     * Remove a vote from a torrent
     */
    async removeTorrentVote(torrentId: string, profileId: string): Promise<void> {
      await repository.deleteTorrentVote(torrentId, profileId);
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
    async getUserTorrentVote(torrentId: string, profileId: string): Promise<TorrentVote | null> {
      const row = await repository.getUserTorrentVote(torrentId, profileId);
      return row ? mapTorrentVoteRowToTorrentVote(row) : null;
    },

    /**
     * Get comments with user vote status
     */
    async getCommentsWithUserVotes(
      infohash: string,
      profileId: string | null,
      limit: number = DEFAULT_COMMENTS_LIMIT,
      offset: number = 0
    ): Promise<CommentWithUserVote[]> {
      const comments = await this.getCommentsByInfohash(infohash, limit, offset);

      if (!profileId) {
        // No profile selected, return comments without vote status
        return comments.map(comment => ({
          ...comment,
          userVote: null,
        }));
      }

      // Get user's votes for these comments
      const userVotes = await this.getUserCommentVotes(infohash, profileId);
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
