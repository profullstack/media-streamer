/**
 * Magnet Ingestion API Tests
 *
 * Tests for the /api/magnets endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

// Mock the torrent-index module
vi.mock('@/lib/torrent-index', () => ({
  ingestMagnet: vi.fn(),
  validateMagnetUri: vi.fn(),
  getTorrentByInfohash: vi.fn(),
  parseMagnetUri: vi.fn((uri: string) => ({
    infohash: 'abc123def456789012345678901234567890abcd',
    name: 'Test Torrent',
    magnetUri: uri,
    trackers: [],
  })),
  triggerPostIngestionEnrichment: vi.fn(() => Promise.resolve({
    success: true,
    enrichmentTriggered: true,
    contentType: 'movie',
  })),
}));

// Mock rate limiting
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(function() {
    return {
      key: 'magnet',
      maxRequests: 30,
      windowMs: 60000,
      algorithm: 'sliding-window',
      requests: new Map(),
    };
  }),
  checkRateLimit: vi.fn(function() { return { allowed: true, remaining: 10, resetAt: Date.now() + 60000, retryAfter: 0 }; }),
  recordRequest: vi.fn(),
  DEFAULT_RATE_LIMITS: {
    magnet: { key: 'magnet', maxRequests: 30, windowMs: 60000, algorithm: 'sliding-window' },
  },
}));

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

import { ingestMagnet, validateMagnetUri, getTorrentByInfohash } from '@/lib/torrent-index';
import { checkRateLimit } from '@/lib/rate-limit';

describe('Magnet Ingestion API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/magnets', () => {
    it('should ingest a valid magnet URI', async () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=Test+Torrent';
      
      vi.mocked(validateMagnetUri).mockReturnValue(true);
      vi.mocked(ingestMagnet).mockResolvedValue({
        success: true,
        torrentId: 'torrent-123',
        infohash: 'abc123def456789012345678901234567890abcd',
        isDuplicate: false,
      });

      const request = new NextRequest('http://localhost/api/magnets', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: magnet }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.torrentId).toBe('torrent-123');
      expect(data.infohash).toBe('abc123def456789012345678901234567890abcd');
    });

    it('should return 200 for duplicate magnet', async () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      
      vi.mocked(validateMagnetUri).mockReturnValue(true);
      vi.mocked(ingestMagnet).mockResolvedValue({
        success: true,
        torrentId: 'existing-123',
        infohash: 'abc123def456789012345678901234567890abcd',
        isDuplicate: true,
      });

      const request = new NextRequest('http://localhost/api/magnets', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: magnet }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isDuplicate).toBe(true);
    });

    it('should reject invalid magnet URI', async () => {
      vi.mocked(validateMagnetUri).mockReturnValue(false);

      const request = new NextRequest('http://localhost/api/magnets', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: 'invalid-magnet' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid magnet URI');
    });

    it('should reject empty request body', async () => {
      const request = new NextRequest('http://localhost/api/magnets', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('should reject missing magnetUri field', async () => {
      const request = new NextRequest('http://localhost/api/magnets', {
        method: 'POST',
        body: JSON.stringify({ url: 'magnet:?xt=...' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
    });

    it('should enforce rate limiting', async () => {
      vi.mocked(checkRateLimit).mockReturnValue({ 
        allowed: false, 
        remaining: 0,
        resetAt: Date.now() + 60000,
        retryAfter: 60,
      });

      const request = new NextRequest('http://localhost/api/magnets', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain('Rate limit');
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(validateMagnetUri).mockReturnValue(true);
      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60000, retryAfter: 0 });
      vi.mocked(ingestMagnet).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      });

      const request = new NextRequest('http://localhost/api/magnets', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });

  describe('GET /api/magnets', () => {
    it('should get torrent by infohash', async () => {
      vi.mocked(getTorrentByInfohash).mockResolvedValue({
        id: 'torrent-123',
        infohash: 'abc123def456789012345678901234567890abcd',
        name: 'Test Torrent',
        clean_title: null,
        magnet_uri: 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd',
        total_size: 1000000,
        file_count: 5,
        piece_length: 262144,
        status: 'ready',
        error_message: null,
        created_by: null,
        indexed_at: '2024-01-01T00:00:00Z',
        seeders: null,
        leechers: null,
        swarm_updated_at: null,
        poster_url: null,
        cover_url: null,
        content_type: null,
        external_id: null,
        external_source: null,
        year: null,
        description: null,
        metadata_fetched_at: null,
        video_codec: null,
        audio_codec: null,
        container: null,
        needs_transcoding: false,
        codec_detected_at: null,
        director: null,
        actors: null,
        genre: null,
        upvotes: 0,
        downvotes: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        files: [],
      });

      const request = new NextRequest(
        'http://localhost/api/magnets?infohash=abc123def456789012345678901234567890abcd'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.infohash).toBe('abc123def456789012345678901234567890abcd');
      expect(data.name).toBe('Test Torrent');
    });

    it('should return 404 for non-existent torrent', async () => {
      vi.mocked(getTorrentByInfohash).mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/magnets?infohash=0000000000000000000000000000000000000000'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should reject invalid infohash format', async () => {
      const request = new NextRequest(
        'http://localhost/api/magnets?infohash=invalid'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid infohash');
    });

    it('should require infohash parameter', async () => {
      const request = new NextRequest('http://localhost/api/magnets');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('infohash');
    });
  });
});
