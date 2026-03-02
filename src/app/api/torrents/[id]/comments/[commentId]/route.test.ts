/**
 * Individual Comment API Route Tests
 *
 * Tests for PATCH and DELETE /api/torrents/:id/comments/:commentId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from './route';

// Mock the comments service
vi.mock('@/lib/comments', () => ({
  getCommentsService: vi.fn(function() {
    return {
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
    };
  }),
}));

// Mock the auth helper
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));
// Mock profiles
vi.mock('@/lib/profiles/profile-utils', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-123'),
}));


import { getCommentsService } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

describe('Individual Comment API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PATCH /api/torrents/:id/comments/:commentId', () => {
    it('should update a comment when authenticated as owner', async () => {
      const mockComment = {
        id: 'comment-123',
        torrentId: 'torrent-123',
        userId: 'user-456',
        content: 'Updated content',
        parentId: null,
        upvotes: 5,
        downvotes: 1,
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        updateComment: vi.fn().mockResolvedValue(mockComment),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'Updated content' }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.comment.content).toBe('Updated content');
      expect(mockService.updateComment).toHaveBeenCalledWith('comment-123', 'profile-123', 'Updated content');
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'Updated content' }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 403 when not the comment owner', async () => {
      const mockService = {
        updateComment: vi.fn().mockRejectedValue(new Error('Not authorized to update this comment')),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-different' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'Updated content' }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Not authorized to update this comment');
    });

    it('should return 404 when comment not found', async () => {
      const mockService = {
        updateComment: vi.fn().mockRejectedValue(new Error('Comment not found')),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/nonexistent', {
        method: 'PATCH',
        body: JSON.stringify({ content: 'Updated content' }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'nonexistent' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Comment not found');
    });

    it('should return 400 for empty content', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123', {
        method: 'PATCH',
        body: JSON.stringify({ content: '' }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Comment content is required');
    });
  });

  describe('DELETE /api/torrents/:id/comments/:commentId', () => {
    it('should delete a comment when authenticated as owner', async () => {
      const mockService = {
        deleteComment: vi.fn().mockResolvedValue(undefined),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(mockService.deleteComment).toHaveBeenCalledWith('comment-123', 'profile-123');
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 403 when not the comment owner', async () => {
      const mockService = {
        deleteComment: vi.fn().mockRejectedValue(new Error('Not authorized to delete this comment')),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-different' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/comment-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'comment-123' }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Not authorized to delete this comment');
    });

    it('should return 404 when comment not found', async () => {
      const mockService = {
        deleteComment: vi.fn().mockRejectedValue(new Error('Comment not found')),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments/nonexistent', {
        method: 'DELETE',
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'torrent-123', commentId: 'nonexistent' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Comment not found');
    });
  });
});
