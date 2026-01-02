/**
 * Comments and Votes Service Tests
 *
 * Tests for the comments and voting service including CRUD operations and vote management.
 * Following TDD - tests written first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCommentsService,
  type CommentsService,
  type Comment,
  type CommentWithUser,
  type TorrentVote,
  type CommentVote,
  type VoteValue,
} from './comments';
import type { CommentsRepository, CommentRow, CommentWithUserRow, CommentVoteRow, TorrentVoteRow } from './repository';

// Mock repository
function createMockRepository(): CommentsRepository {
  return {
    // Comment operations
    getCommentById: vi.fn(),
    getCommentsByTorrentId: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    getCommentCount: vi.fn(),

    // Comment vote operations
    getCommentVote: vi.fn(),
    upsertCommentVote: vi.fn(),
    deleteCommentVote: vi.fn(),
    getUserCommentVotes: vi.fn(),

    // Torrent vote operations
    getTorrentVote: vi.fn(),
    upsertTorrentVote: vi.fn(),
    deleteTorrentVote: vi.fn(),
    getTorrentVoteCounts: vi.fn(),
    getUserTorrentVote: vi.fn(),
  };
}

describe('CommentsService', () => {
  let mockRepository: ReturnType<typeof createMockRepository>;
  let service: CommentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    service = createCommentsService(mockRepository);
  });

  // ============================================================================
  // Comment Operations
  // ============================================================================

  describe('getCommentsByTorrentId', () => {
    it('should return comments for a torrent', async () => {
      const torrentId = 'torrent-123';
      const mockCommentRows: CommentWithUserRow[] = [
        {
          id: 'comment-1',
          torrent_id: torrentId,
          user_id: 'user-1',
          content: 'Great torrent!',
          parent_id: null,
          upvotes: 5,
          downvotes: 1,
          deleted_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          user_email: 'user1@example.com',
        },
        {
          id: 'comment-2',
          torrent_id: torrentId,
          user_id: 'user-2',
          content: 'Thanks for sharing!',
          parent_id: null,
          upvotes: 2,
          downvotes: 0,
          deleted_at: null,
          created_at: '2026-01-01T01:00:00Z',
          updated_at: '2026-01-01T01:00:00Z',
          user_email: 'user2@example.com',
        },
      ];

      (mockRepository.getCommentsByTorrentId as ReturnType<typeof vi.fn>).mockResolvedValue(mockCommentRows);

      const result = await service.getCommentsByTorrentId(torrentId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('comment-1');
      expect(result[0].torrentId).toBe(torrentId);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].content).toBe('Great torrent!');
      expect(result[0].userEmail).toBe('user1@example.com');
      expect(mockRepository.getCommentsByTorrentId).toHaveBeenCalledWith(torrentId, 50, 0);
    });

    it('should support pagination', async () => {
      const torrentId = 'torrent-123';

      (mockRepository.getCommentsByTorrentId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.getCommentsByTorrentId(torrentId, 10, 20);

      expect(mockRepository.getCommentsByTorrentId).toHaveBeenCalledWith(torrentId, 10, 20);
    });

    it('should return empty array when no comments exist', async () => {
      (mockRepository.getCommentsByTorrentId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.getCommentsByTorrentId('torrent-no-comments');

      expect(result).toEqual([]);
    });
  });

  describe('createComment', () => {
    it('should create a new comment', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';
      const content = 'This is a great torrent!';

      const mockCommentRow: CommentRow = {
        id: 'comment-new',
        torrent_id: torrentId,
        user_id: userId,
        content,
        parent_id: null,
        upvotes: 0,
        downvotes: 0,
        deleted_at: null,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.createComment as ReturnType<typeof vi.fn>).mockResolvedValue(mockCommentRow);

      const result = await service.createComment(torrentId, userId, content);

      expect(result.id).toBe('comment-new');
      expect(result.torrentId).toBe(torrentId);
      expect(result.userId).toBe(userId);
      expect(result.content).toBe(content);
      expect(result.parentId).toBeNull();
      expect(mockRepository.createComment).toHaveBeenCalledWith({
        torrent_id: torrentId,
        user_id: userId,
        content,
        parent_id: null,
      });
    });

    it('should create a reply to an existing comment', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';
      const content = 'I agree with you!';
      const parentId = 'comment-parent';

      const mockCommentRow: CommentRow = {
        id: 'comment-reply',
        torrent_id: torrentId,
        user_id: userId,
        content,
        parent_id: parentId,
        upvotes: 0,
        downvotes: 0,
        deleted_at: null,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.createComment as ReturnType<typeof vi.fn>).mockResolvedValue(mockCommentRow);

      const result = await service.createComment(torrentId, userId, content, parentId);

      expect(result.id).toBe('comment-reply');
      expect(result.parentId).toBe(parentId);
      expect(mockRepository.createComment).toHaveBeenCalledWith({
        torrent_id: torrentId,
        user_id: userId,
        content,
        parent_id: parentId,
      });
    });

    it('should throw error for empty content', async () => {
      await expect(
        service.createComment('torrent-123', 'user-456', '')
      ).rejects.toThrow('Comment content cannot be empty');
    });

    it('should throw error for whitespace-only content', async () => {
      await expect(
        service.createComment('torrent-123', 'user-456', '   \n\t  ')
      ).rejects.toThrow('Comment content cannot be empty');
    });

    it('should throw error for content exceeding max length', async () => {
      const longContent = 'a'.repeat(10001);

      await expect(
        service.createComment('torrent-123', 'user-456', longContent)
      ).rejects.toThrow('Comment content exceeds maximum length');
    });
  });

  describe('updateComment', () => {
    it('should update comment content', async () => {
      const commentId = 'comment-123';
      const userId = 'user-456';
      const newContent = 'Updated comment content';

      const existingCommentRow: CommentRow = {
        id: commentId,
        torrent_id: 'torrent-123',
        user_id: userId,
        content: 'Original content',
        parent_id: null,
        upvotes: 5,
        downvotes: 1,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const updatedCommentRow: CommentRow = {
        ...existingCommentRow,
        content: newContent,
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.getCommentById as ReturnType<typeof vi.fn>).mockResolvedValue(existingCommentRow);
      (mockRepository.updateComment as ReturnType<typeof vi.fn>).mockResolvedValue(updatedCommentRow);

      const result = await service.updateComment(commentId, userId, newContent);

      expect(result.content).toBe(newContent);
      expect(mockRepository.updateComment).toHaveBeenCalledWith(commentId, newContent);
    });

    it('should throw error when comment not found', async () => {
      (mockRepository.getCommentById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.updateComment('nonexistent', 'user-456', 'New content')
      ).rejects.toThrow('Comment not found');
    });

    it('should throw error when user is not the author', async () => {
      const existingCommentRow: CommentRow = {
        id: 'comment-123',
        torrent_id: 'torrent-123',
        user_id: 'user-original',
        content: 'Original content',
        parent_id: null,
        upvotes: 0,
        downvotes: 0,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      (mockRepository.getCommentById as ReturnType<typeof vi.fn>).mockResolvedValue(existingCommentRow);

      await expect(
        service.updateComment('comment-123', 'user-different', 'New content')
      ).rejects.toThrow('Not authorized to update this comment');
    });

    it('should throw error when comment is deleted', async () => {
      const deletedCommentRow: CommentRow = {
        id: 'comment-123',
        torrent_id: 'torrent-123',
        user_id: 'user-456',
        content: 'Original content',
        parent_id: null,
        upvotes: 0,
        downvotes: 0,
        deleted_at: '2026-01-01T12:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      (mockRepository.getCommentById as ReturnType<typeof vi.fn>).mockResolvedValue(deletedCommentRow);

      await expect(
        service.updateComment('comment-123', 'user-456', 'New content')
      ).rejects.toThrow('Cannot update a deleted comment');
    });
  });

  describe('deleteComment', () => {
    it('should soft delete a comment', async () => {
      const commentId = 'comment-123';
      const userId = 'user-456';

      const existingCommentRow: CommentRow = {
        id: commentId,
        torrent_id: 'torrent-123',
        user_id: userId,
        content: 'Original content',
        parent_id: null,
        upvotes: 0,
        downvotes: 0,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      (mockRepository.getCommentById as ReturnType<typeof vi.fn>).mockResolvedValue(existingCommentRow);
      (mockRepository.deleteComment as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.deleteComment(commentId, userId);

      expect(mockRepository.deleteComment).toHaveBeenCalledWith(commentId);
    });

    it('should throw error when comment not found', async () => {
      (mockRepository.getCommentById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.deleteComment('nonexistent', 'user-456')
      ).rejects.toThrow('Comment not found');
    });

    it('should throw error when user is not the author', async () => {
      const existingCommentRow: CommentRow = {
        id: 'comment-123',
        torrent_id: 'torrent-123',
        user_id: 'user-original',
        content: 'Original content',
        parent_id: null,
        upvotes: 0,
        downvotes: 0,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      (mockRepository.getCommentById as ReturnType<typeof vi.fn>).mockResolvedValue(existingCommentRow);

      await expect(
        service.deleteComment('comment-123', 'user-different')
      ).rejects.toThrow('Not authorized to delete this comment');
    });
  });

  describe('getCommentCount', () => {
    it('should return comment count for a torrent', async () => {
      const torrentId = 'torrent-123';

      (mockRepository.getCommentCount as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await service.getCommentCount(torrentId);

      expect(result).toBe(42);
      expect(mockRepository.getCommentCount).toHaveBeenCalledWith(torrentId);
    });
  });

  // ============================================================================
  // Comment Vote Operations
  // ============================================================================

  describe('voteOnComment', () => {
    it('should create an upvote on a comment', async () => {
      const commentId = 'comment-123';
      const userId = 'user-456';
      const voteValue: VoteValue = 1;

      const mockVoteRow: CommentVoteRow = {
        id: 'vote-new',
        comment_id: commentId,
        user_id: userId,
        vote_value: voteValue,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.upsertCommentVote as ReturnType<typeof vi.fn>).mockResolvedValue(mockVoteRow);

      const result = await service.voteOnComment(commentId, userId, voteValue);

      expect(result.id).toBe('vote-new');
      expect(result.commentId).toBe(commentId);
      expect(result.userId).toBe(userId);
      expect(result.voteValue).toBe(1);
      expect(mockRepository.upsertCommentVote).toHaveBeenCalledWith(commentId, userId, voteValue);
    });

    it('should create a downvote on a comment', async () => {
      const commentId = 'comment-123';
      const userId = 'user-456';
      const voteValue: VoteValue = -1;

      const mockVoteRow: CommentVoteRow = {
        id: 'vote-new',
        comment_id: commentId,
        user_id: userId,
        vote_value: voteValue,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.upsertCommentVote as ReturnType<typeof vi.fn>).mockResolvedValue(mockVoteRow);

      const result = await service.voteOnComment(commentId, userId, voteValue);

      expect(result.voteValue).toBe(-1);
    });

    it('should update existing vote when changing vote', async () => {
      const commentId = 'comment-123';
      const userId = 'user-456';
      const newVoteValue: VoteValue = -1;

      const updatedVoteRow: CommentVoteRow = {
        id: 'vote-existing',
        comment_id: commentId,
        user_id: userId,
        vote_value: newVoteValue,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.upsertCommentVote as ReturnType<typeof vi.fn>).mockResolvedValue(updatedVoteRow);

      const result = await service.voteOnComment(commentId, userId, newVoteValue);

      expect(result.voteValue).toBe(-1);
    });

    it('should throw error for invalid vote value', async () => {
      await expect(
        service.voteOnComment('comment-123', 'user-456', 0 as VoteValue)
      ).rejects.toThrow('Invalid vote value');

      await expect(
        service.voteOnComment('comment-123', 'user-456', 2 as VoteValue)
      ).rejects.toThrow('Invalid vote value');
    });
  });

  describe('removeCommentVote', () => {
    it('should remove a vote from a comment', async () => {
      const commentId = 'comment-123';
      const userId = 'user-456';

      (mockRepository.deleteCommentVote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.removeCommentVote(commentId, userId);

      expect(mockRepository.deleteCommentVote).toHaveBeenCalledWith(commentId, userId);
    });
  });

  describe('getUserCommentVotes', () => {
    it('should return user votes for comments on a torrent', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';

      const mockVoteRows: CommentVoteRow[] = [
        {
          id: 'vote-1',
          comment_id: 'comment-1',
          user_id: userId,
          vote_value: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'vote-2',
          comment_id: 'comment-2',
          user_id: userId,
          vote_value: -1,
          created_at: '2026-01-01T01:00:00Z',
          updated_at: '2026-01-01T01:00:00Z',
        },
      ];

      (mockRepository.getUserCommentVotes as ReturnType<typeof vi.fn>).mockResolvedValue(mockVoteRows);

      const result = await service.getUserCommentVotes(torrentId, userId);

      expect(result).toHaveLength(2);
      expect(result[0].commentId).toBe('comment-1');
      expect(result[0].voteValue).toBe(1);
      expect(result[1].commentId).toBe('comment-2');
      expect(result[1].voteValue).toBe(-1);
      expect(mockRepository.getUserCommentVotes).toHaveBeenCalledWith(torrentId, userId);
    });
  });

  // ============================================================================
  // Torrent Vote Operations
  // ============================================================================

  describe('voteOnTorrent', () => {
    it('should create an upvote on a torrent', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';
      const voteValue: VoteValue = 1;

      const mockVoteRow: TorrentVoteRow = {
        id: 'vote-new',
        torrent_id: torrentId,
        user_id: userId,
        vote_value: voteValue,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.upsertTorrentVote as ReturnType<typeof vi.fn>).mockResolvedValue(mockVoteRow);

      const result = await service.voteOnTorrent(torrentId, userId, voteValue);

      expect(result.id).toBe('vote-new');
      expect(result.torrentId).toBe(torrentId);
      expect(result.userId).toBe(userId);
      expect(result.voteValue).toBe(1);
      expect(mockRepository.upsertTorrentVote).toHaveBeenCalledWith(torrentId, userId, voteValue);
    });

    it('should create a downvote on a torrent', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';
      const voteValue: VoteValue = -1;

      const mockVoteRow: TorrentVoteRow = {
        id: 'vote-new',
        torrent_id: torrentId,
        user_id: userId,
        vote_value: voteValue,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      };

      (mockRepository.upsertTorrentVote as ReturnType<typeof vi.fn>).mockResolvedValue(mockVoteRow);

      const result = await service.voteOnTorrent(torrentId, userId, voteValue);

      expect(result.voteValue).toBe(-1);
    });

    it('should throw error for invalid vote value', async () => {
      await expect(
        service.voteOnTorrent('torrent-123', 'user-456', 0 as VoteValue)
      ).rejects.toThrow('Invalid vote value');
    });
  });

  describe('removeTorrentVote', () => {
    it('should remove a vote from a torrent', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';

      (mockRepository.deleteTorrentVote as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.removeTorrentVote(torrentId, userId);

      expect(mockRepository.deleteTorrentVote).toHaveBeenCalledWith(torrentId, userId);
    });
  });

  describe('getTorrentVoteCounts', () => {
    it('should return vote counts for a torrent', async () => {
      const torrentId = 'torrent-123';
      const mockCounts = { upvotes: 42, downvotes: 5 };

      (mockRepository.getTorrentVoteCounts as ReturnType<typeof vi.fn>).mockResolvedValue(mockCounts);

      const result = await service.getTorrentVoteCounts(torrentId);

      expect(result).toEqual(mockCounts);
      expect(mockRepository.getTorrentVoteCounts).toHaveBeenCalledWith(torrentId);
    });
  });

  describe('getUserTorrentVote', () => {
    it('should return user vote for a torrent', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';

      const mockVoteRow: TorrentVoteRow = {
        id: 'vote-123',
        torrent_id: torrentId,
        user_id: userId,
        vote_value: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      (mockRepository.getUserTorrentVote as ReturnType<typeof vi.fn>).mockResolvedValue(mockVoteRow);

      const result = await service.getUserTorrentVote(torrentId, userId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('vote-123');
      expect(result!.torrentId).toBe(torrentId);
      expect(result!.voteValue).toBe(1);
    });

    it('should return null when user has not voted', async () => {
      (mockRepository.getUserTorrentVote as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getUserTorrentVote('torrent-123', 'user-456');

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Comments with User Votes
  // ============================================================================

  describe('getCommentsWithUserVotes', () => {
    it('should return comments with user vote status', async () => {
      const torrentId = 'torrent-123';
      const userId = 'user-456';

      const mockCommentRows: CommentWithUserRow[] = [
        {
          id: 'comment-1',
          torrent_id: torrentId,
          user_id: 'user-1',
          content: 'Great torrent!',
          parent_id: null,
          upvotes: 5,
          downvotes: 1,
          deleted_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          user_email: 'user1@example.com',
        },
        {
          id: 'comment-2',
          torrent_id: torrentId,
          user_id: 'user-2',
          content: 'Thanks!',
          parent_id: null,
          upvotes: 2,
          downvotes: 0,
          deleted_at: null,
          created_at: '2026-01-01T01:00:00Z',
          updated_at: '2026-01-01T01:00:00Z',
          user_email: 'user2@example.com',
        },
      ];

      const mockUserVoteRows: CommentVoteRow[] = [
        {
          id: 'vote-1',
          comment_id: 'comment-1',
          user_id: userId,
          vote_value: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      (mockRepository.getCommentsByTorrentId as ReturnType<typeof vi.fn>).mockResolvedValue(mockCommentRows);
      (mockRepository.getUserCommentVotes as ReturnType<typeof vi.fn>).mockResolvedValue(mockUserVoteRows);

      const result = await service.getCommentsWithUserVotes(torrentId, userId);

      expect(result).toHaveLength(2);
      expect(result[0].userVote).toBe(1);
      expect(result[1].userVote).toBeNull();
    });

    it('should return comments without user votes when userId is null', async () => {
      const torrentId = 'torrent-123';

      const mockCommentRows: CommentWithUserRow[] = [
        {
          id: 'comment-1',
          torrent_id: torrentId,
          user_id: 'user-1',
          content: 'Great torrent!',
          parent_id: null,
          upvotes: 5,
          downvotes: 1,
          deleted_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          user_email: 'user1@example.com',
        },
      ];

      (mockRepository.getCommentsByTorrentId as ReturnType<typeof vi.fn>).mockResolvedValue(mockCommentRows);

      const result = await service.getCommentsWithUserVotes(torrentId, null);

      expect(result).toHaveLength(1);
      expect(result[0].userVote).toBeNull();
      expect(mockRepository.getUserCommentVotes).not.toHaveBeenCalled();
    });
  });
});
