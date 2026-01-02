/**
 * Comment Vote API Route Tests
 *
 * Tests for POST and DELETE /api/torrents/:id/comments/:commentId/vote
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from './route';

// Mock the comments service
vi.mock('@/lib/comments', () => ({
  getCommentsService: vi.fn(() => ({
    voteOnComment: vi.fn(),
    removeCommentVote: vi.fn(),
  })),
}));

// Mock the auth helper
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { getCommentsService } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

describe('Comment Vote API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/torrents/:id/comments/:commentId/vote', () => {
    it('should create an upvote when authenticated', async () => {
      const mockVote = {
        id: 'vote-new',
        commentId: 'comment-123',
        userId: 'user-456',
        voteValue: 1,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        voteOnComment: vi.fn().mockResolvedValue(mockVote),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: 1 }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.vote.voteValue).toBe(1);
      expect(mockService.voteOnComment).toHaveBeenCalledWith('comment-123', 'user-456', 1);
    });

    it('should create a downvote when authenticated', async () => {
      const mockVote = {
        id: 'vote-new',
        commentId: 'comment-123',
        userId: 'user-456',
        voteValue: -1,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        voteOnComment: vi.fn().mockResolvedValue(mockVote),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: -1 }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.vote.voteValue).toBe(-1);
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: 1 }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 for invalid vote value', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: 0 }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Vote value must be 1 (upvote) or -1 (downvote)');
    });
  });

  describe('DELETE /api/torrents/:id/comments/:commentId/vote', () => {
    it('should remove a vote when authenticated', async () => {
      const mockService = {
        removeCommentVote: vi.fn().mockResolvedValue(undefined),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123/vote', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(mockService.removeCommentVote).toHaveBeenCalledWith('comment-123', 'user-456');
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123/vote', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });
  });
});
