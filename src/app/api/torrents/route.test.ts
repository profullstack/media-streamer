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
  getSubscriptionRepository: vi.fn(function() { return mockSubscriptionRepository; }),
}));

// Mock Supabase client
const mockSupabaseUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});

const mockSupabaseSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    in: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }),
});

const mockSupabaseUpsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase/client', () => ({
  getServerClient: vi.fn(function() {
    return {
      from: vi.fn(function() {
        return {
          update: mockSupabaseUpdate,
          select: mockSupabaseSelect,
          upsert: mockSupabaseUpsert,
        };
      }),
    };
  }),
  resetServerClient: vi.fn(),
}));

// Mock codec detection
vi.mock('@/lib/codec-detection', () => ({
  detectCodecFromUrl: vi.fn().mockResolvedValue({
    videoCodec: 'h264',
    audioCodec: 'aac',
    container: 'mp4',
    needsTranscoding: false,
    duration: 120,
    bitRate: 5000000,
  }),
  formatCodecInfoForDb: vi.fn().mockReturnValue({
    video_codec: 'h264',
    audio_codec: 'aac',
    container: 'mp4',
    needs_transcoding: false,
    duration_seconds: 120,
    bit_rate: 5000000,
    resolution: '1920x1080',
  }),
}));

// Mock metadata enrichment
vi.mock('@/lib/metadata-enrichment', () => ({
  enrichTorrentMetadata: vi.fn().mockResolvedValue({
    contentType: 'movie',
    posterUrl: 'https://example.com/poster.jpg',
    year: 2024,
  }),
  cleanTorrentNameForDisplay: vi.fn((name: string) => name),
}));

// Mock the indexer module
vi.mock('@/lib/indexer', () => ({
  IndexerService: vi.fn(function() {
    return {
      indexMagnet: vi.fn(),
      destroy: vi.fn(),
    };
  }),
  IndexerError: class IndexerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'IndexerError';
    }
  },
  DuplicateTorrentError: class DuplicateTorrentError extends Error {
    constructor(infohash: string) {
      super(`Torrent with infohash ${infohash} already exists`);
      this.name = 'DuplicateTorrentError';
    }
  },
}));

import { POST } from './route';
import { IndexerService } from '@/lib/indexer';

const mockIndexerService = vi.mocked(IndexerService);

describe('Torrents API Route', () => {
  let mockIndexMagnet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockIndexMagnet = vi.fn();
    mockIndexerService.mockImplementation(() => ({
      indexMagnet: mockIndexMagnet,
      destroy: vi.fn(),
    }) as unknown as IndexerService);
  });

  describe('POST /api/torrents', () => {
    it('should index a new torrent successfully', async () => {
      const mockResult = {
        torrentId: 'torrent-uuid-123',
        infohash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        fileCount: 10,
        totalSize: 1000000,
        isNew: true,
      };

      mockIndexMagnet.mockResolvedValue(mockResult);

      const request = new NextRequest('http://localhost:3000/api/torrents', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.torrentId).toBe('torrent-uuid-123');
      expect(data.infohash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(data.name).toBe('Test Torrent');
      expect(data.isNew).toBe(true);
    });

    it('should return existing torrent if already indexed', async () => {
      const mockResult = {
        torrentId: 'existing-torrent-uuid',
        infohash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        fileCount: 10,
        totalSize: 1000000,
        isNew: false,
      };

      mockIndexMagnet.mockResolvedValue(mockResult);

      const request = new NextRequest('http://localhost:3000/api/torrents', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNew).toBe(false);
    });

    it('should return 400 for missing magnetUri', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrents', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('magnetUri is required');
    });

    it('should return 400 for empty magnetUri', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrents', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: '' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('magnetUri is required');
    });

    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrents', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
    });

    it('should return 400 for invalid magnet URI', async () => {
      const { IndexerError } = await import('@/lib/indexer');
      mockIndexMagnet.mockRejectedValue(new IndexerError('Invalid magnet URI'));

      const request = new NextRequest('http://localhost:3000/api/torrents', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: 'invalid' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid magnet URI');
    });

    it('should handle indexer errors gracefully', async () => {
      mockIndexMagnet.mockRejectedValue(new Error('Network error'));

      const request = new NextRequest('http://localhost:3000/api/torrents', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to index torrent');
    });
  });
});
