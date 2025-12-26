/**
 * File Search API Tests
 *
 * Tests for the /api/search/files endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'user-123', email: 'test@example.com' })),
}));

// Mock subscription
const mockSubscriptionRepository = {
  getSubscription: vi.fn().mockResolvedValue({
    id: 'sub-123',
    user_id: 'user-123',
    tier: 'premium',
    status: 'active',
    subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trial_expires_at: null,
  }),
};

vi.mock('@/lib/subscription', () => ({
  getSubscriptionRepository: vi.fn(() => mockSubscriptionRepository),
}));

// Mock the search module
vi.mock('@/lib/torrent-index', () => ({
  searchTorrentFiles: vi.fn(),
}));

import { GET } from './route';
import { searchTorrentFiles } from '@/lib/torrent-index';

describe('File Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/search/files', () => {
    it('should search files with query parameter', async () => {
      vi.mocked(searchTorrentFiles).mockResolvedValue({
        files: [
          {
            id: 'file-1',
            path: 'Music/Artist/song.mp3',
            name: 'song.mp3',
            size: 5000000,
            extension: 'mp3',
            mediaCategory: 'audio',
            mimeType: 'audio/mpeg',
            fileIndex: 0,
            pieceStart: 0,
            pieceEnd: 10,
            torrentId: 'torrent-1',
            torrentName: 'Music Collection',
            torrentInfohash: 'abc123def456789012345678901234567890abcd',
            rank: 0.9,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      });

      const request = new NextRequest('http://localhost/api/search/files?q=song');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.files).toHaveLength(1);
      expect(data.files[0].name).toBe('song.mp3');
    });

    it('should filter by media type', async () => {
      vi.mocked(searchTorrentFiles).mockResolvedValue({
        files: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const request = new NextRequest('http://localhost/api/search/files?q=test&mediaType=audio');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(searchTorrentFiles).toHaveBeenCalledWith(
        expect.objectContaining({ mediaType: 'audio' })
      );
    });

    it('should filter by torrent ID', async () => {
      vi.mocked(searchTorrentFiles).mockResolvedValue({
        files: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const request = new NextRequest('http://localhost/api/search/files?q=test&torrentId=torrent-123');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(searchTorrentFiles).toHaveBeenCalledWith(
        expect.objectContaining({ torrentId: 'torrent-123' })
      );
    });

    it('should support pagination', async () => {
      vi.mocked(searchTorrentFiles).mockResolvedValue({
        files: [],
        total: 0,
        limit: 10,
        offset: 20,
      });

      const request = new NextRequest('http://localhost/api/search/files?q=test&limit=10&offset=20');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(searchTorrentFiles).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should require query parameter', async () => {
      const request = new NextRequest('http://localhost/api/search/files');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('query');
    });

    it('should reject empty query', async () => {
      const request = new NextRequest('http://localhost/api/search/files?q=');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('query');
    });

    it('should handle search errors gracefully', async () => {
      vi.mocked(searchTorrentFiles).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/search/files?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });

    it('should validate media type parameter', async () => {
      vi.mocked(searchTorrentFiles).mockResolvedValue({
        files: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const request = new NextRequest('http://localhost/api/search/files?q=test&mediaType=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('mediaType');
    });

    it('should return proper response structure', async () => {
      vi.mocked(searchTorrentFiles).mockResolvedValue({
        files: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const request = new NextRequest('http://localhost/api/search/files?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('files');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('offset');
    });
  });
});
