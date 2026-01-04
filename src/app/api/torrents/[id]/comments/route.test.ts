/**
 * Torrent Comments API Route Tests
 *
 * Tests for GET /api/torrents/:id/comments and POST /api/torrents/:id/comments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// Mock the comments service
vi.mock('@/lib/comments', () => ({
  getCommentsService: vi.fn(function() {
    return {
      getCommentsWithUserVotes: vi.fn(),
      createComment: vi.fn(),
      getCommentCount: vi.fn(),
    };
  }),
}));

// Mock the auth helper
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { getCommentsService } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

describe('Torrent Comments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/torrents/:id/comments', () => {
    it('should return comments for a torrent', async () => {
      const mockComments = [
        {
          id: 'comment-1',
          torrentId: 'torrent-123',
          userId: 'user-1',
          content: 'Great torrent!',
          parentId: null,
          upvotes: 5,
          downvotes: 1,
          deletedAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          userEmail: 'user1@example.com',
          userVote: null,
        },
      ];

      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue(mockComments),
        getCommentCount: vi.fn().mockResolvedValue(1),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments');
      const response = await GET(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.comments).toHaveLength(1);
      expect(data.comments[0].id).toBe('comment-1');
      expect(data.total).toBe(1);
    });

    it('should include user vote status when authenticated', async () => {
      const mockComments = [
        {
          id: 'comment-1',
          torrentId: 'torrent-123',
          userId: 'user-1',
          content: 'Great torrent!',
          parentId: null,
          upvotes: 5,
          downvotes: 1,
          deletedAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          userEmail: 'user1@example.com',
          userVote: 1,
        },
      ];

      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue(mockComments),
        getCommentCount: vi.fn().mockResolvedValue(1),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments');
      const response = await GET(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.comments[0].userVote).toBe(1);
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith('torrent-123', 'user-456', 50, 0);
    });

    it('should support pagination', async () => {
      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue([]),
        getCommentCount: vi.fn().mockResolvedValue(100),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments?limit=10&offset=20');
      const response = await GET(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith('torrent-123', null, 10, 20);
    });

    it('should return 400 for missing torrent ID', async () => {
      const request = new NextRequest('http://localhost/api/torrents//comments');
      const response = await GET(request, { params: Promise.resolve({ id: '' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Torrent ID is required');
    });
  });

  describe('POST /api/torrents/:id/comments', () => {
    it('should create a comment when authenticated', async () => {
      const mockComment = {
        id: 'comment-new',
        torrentId: 'torrent-123',
        userId: 'user-456',
        content: 'This is a great torrent!',
        parentId: null,
        upvotes: 0,
        downvotes: 0,
        deletedAt: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        createComment: vi.fn().mockResolvedValue(mockComment),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments', {
        method: 'POST',
        body: JSON.stringify({ content: 'This is a great torrent!' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.comment.id).toBe('comment-new');
      expect(data.comment.content).toBe('This is a great torrent!');
    });

    it('should create a reply to an existing comment', async () => {
      const mockComment = {
        id: 'comment-reply',
        torrentId: 'torrent-123',
        userId: 'user-456',
        content: 'I agree!',
        parentId: 'comment-parent',
        upvotes: 0,
        downvotes: 0,
        deletedAt: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        createComment: vi.fn().mockResolvedValue(mockComment),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments', {
        method: 'POST',
        body: JSON.stringify({ content: 'I agree!', parentId: 'comment-parent' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.comment.parentId).toBe('comment-parent');
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test comment' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 for empty content', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/comments', {
        method: 'POST',
        body: JSON.stringify({ content: '' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Comment content is required');
    });

    it('should return 400 for missing torrent ID', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents//comments', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test comment' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: '' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Torrent ID is required');
    });
  });
});
