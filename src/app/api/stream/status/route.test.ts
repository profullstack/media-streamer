/**
 * Stream Status API Tests
 *
 * Tests for the SSE endpoint that provides real-time connection status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the streaming service
vi.mock('@/lib/streaming', () => ({
  StreamingService: vi.fn().mockImplementation(() => ({
    getTorrentStats: vi.fn(),
    destroy: vi.fn(),
  })),
}));

// Mock the supabase queries
vi.mock('@/lib/supabase', () => ({
  getTorrentByInfohash: vi.fn(),
}));

// Import after mocks
import { GET } from './route';
import { getTorrentByInfohash } from '@/lib/supabase';

describe('Stream Status API - GET /api/stream/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 if infohash is missing', async () => {
    const request = new NextRequest('http://localhost/api/stream/status');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Missing required parameter: infohash');
  });

  it('should return 400 if infohash is invalid format', async () => {
    const request = new NextRequest(
      'http://localhost/api/stream/status?infohash=invalid'
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid infohash format');
  });

  it('should return 404 if torrent not found in database', async () => {
    vi.mocked(getTorrentByInfohash).mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost/api/stream/status?infohash=1234567890abcdef1234567890abcdef12345678'
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Torrent not found');
  });

  it('should return SSE stream with correct headers when torrent exists', async () => {
    vi.mocked(getTorrentByInfohash).mockResolvedValue({
      id: 'torrent-123',
      infohash: '1234567890abcdef1234567890abcdef12345678',
      name: 'Test Torrent',
      magnet_uri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
      total_size: 1000000,
      file_count: 1,
      piece_length: 16384,
      seeders: null,
      leechers: null,
      swarm_updated_at: null,
      created_by: null,
      status: 'ready',
      error_message: null,
      indexed_at: new Date().toISOString(),
      poster_url: null,
      cover_url: null,
      content_type: null,
      external_id: null,
      external_source: null,
      year: null,
      description: null,
      metadata_fetched_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const request = new NextRequest(
      'http://localhost/api/stream/status?infohash=1234567890abcdef1234567890abcdef12345678'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('should include fileIndex in status updates when provided', async () => {
    vi.mocked(getTorrentByInfohash).mockResolvedValue({
      id: 'torrent-123',
      infohash: '1234567890abcdef1234567890abcdef12345678',
      name: 'Test Torrent',
      magnet_uri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
      total_size: 1000000,
      file_count: 5,
      piece_length: 16384,
      seeders: null,
      leechers: null,
      swarm_updated_at: null,
      created_by: null,
      status: 'ready',
      error_message: null,
      indexed_at: new Date().toISOString(),
      poster_url: null,
      cover_url: null,
      content_type: null,
      external_id: null,
      external_source: null,
      year: null,
      description: null,
      metadata_fetched_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const request = new NextRequest(
      'http://localhost/api/stream/status?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=2'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('should validate fileIndex is a non-negative integer', async () => {
    const request = new NextRequest(
      'http://localhost/api/stream/status?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=-1'
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('fileIndex must be a non-negative integer');
  });

  it('should validate fileIndex is a number', async () => {
    const request = new NextRequest(
      'http://localhost/api/stream/status?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=abc'
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('fileIndex must be a non-negative integer');
  });
});
