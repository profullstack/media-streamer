/**
 * Torrent Vote API Route Tests
 *
 * Tests for GET, POST, and DELETE /api/torrents/:id/vote
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';

// Mock the comments service
vi.mock('@/lib/comments', () => ({
  getCommentsService: vi.fn(() => ({
    getTorrentVoteCounts: vi.fn(),
    getUserTorrentVote: vi.fn(),
    voteOnTorrent: vi.fn(),
    removeTorrentVote: vi.fn(),
  })),
}));

// Mock the auth helper
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { getCommentsService } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';

describe('Torrent Vote API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/torrents/:id/vote', () => {
    it('should return vote counts for a torrent', async () => {
      const mockCounts = { upvotes: 42, downvotes: 5 };

      const mockService = {
        getTorrentVoteCounts: vi.fn().mockResolvedValue(mockCounts),
        getUserTorrentVote: vi.fn().mockResolvedValue(null),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote');
      const response = await GET(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.upvotes).toBe(42);
      expect(data.downvotes).toBe(5);
      expect(data.userVote).toBeNull();
    });

    it('should include user vote when authenticated', async () => {
      const mockCounts = { upvotes: 42, downvotes: 5 };
      const mockUserVote = {
        id: 'vote-123',
        torrentId: 'torrent-123',
        userId: 'user-456',
        voteValue: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      };

      const mockService = {
        getTorrentVoteCounts: vi.fn().mockResolvedValue(mockCounts),
        getUserTorrentVote: vi.fn().mockResolvedValue(mockUserVote),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote');
      const response = await GET(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.userVote).toBe(1);
    });

    it('should return 400 for missing torrent ID', async () => {
      const request = new NextRequest('http://localhost/api/torrents//vote');
      const response = await GET(request, { params: Promise.resolve({ id: '' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Torrent ID is required');
    });
  });

  describe('POST /api/torrents/:id/vote', () => {
    it('should create an upvote when authenticated', async () => {
      const mockVote = {
        id: 'vote-new',
        torrentId: 'torrent-123',
        userId: 'user-456',
        voteValue: 1,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        voteOnTorrent: vi.fn().mockResolvedValue(mockVote),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: 1 }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.vote.voteValue).toBe(1);
      expect(mockService.voteOnTorrent).toHaveBeenCalledWith('torrent-123', 'user-456', 1);
    });

    it('should create a downvote when authenticated', async () => {
      const mockVote = {
        id: 'vote-new',
        torrentId: 'torrent-123',
        userId: 'user-456',
        voteValue: -1,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        voteOnTorrent: vi.fn().mockResolvedValue(mockVote),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: -1 }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.vote.voteValue).toBe(-1);
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: 1 }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 for invalid vote value', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote', {
        method: 'POST',
        body: JSON.stringify({ value: 0 }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Vote value must be 1 (upvote) or -1 (downvote)');
    });
  });

  describe('DELETE /api/torrents/:id/vote', () => {
    it('should remove a vote when authenticated', async () => {
      const mockService = {
        removeTorrentVote: vi.fn().mockResolvedValue(undefined),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-456' });

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(mockService.removeTorrentVote).toHaveBeenCalledWith('torrent-123', 'user-456');
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/torrents/torrent-123/vote', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'torrent-123' }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });
  });
});
