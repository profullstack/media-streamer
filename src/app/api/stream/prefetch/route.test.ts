/**
 * Prefetch API Route Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// Mock the streaming service
vi.mock('@/lib/streaming', () => ({
  getStreamingService: vi.fn(() => ({
    getStreamInfo: vi.fn().mockResolvedValue({
      fileName: 'test-track.mp3',
      size: 5000000,
      mimeType: 'audio/mpeg',
      mediaCategory: 'audio',
    }),
  })),
}));

// Mock the supabase client
vi.mock('@/lib/supabase', () => ({
  getTorrentByInfohash: vi.fn().mockResolvedValue({
    magnet_uri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=test',
  }),
}));

// Mock the logger
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  generateRequestId: vi.fn(() => 'test-request-id'),
}));

describe('POST /api/stream/prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prefetch a file successfully', async () => {
    const request = new NextRequest('http://localhost/api/stream/prefetch', {
      method: 'POST',
      body: JSON.stringify({
        infohash: '1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.fileName).toBe('test-track.mp3');
    expect(data.size).toBe(5000000);
    expect(data.mimeType).toBe('audio/mpeg');
  });

  it('should return 400 if infohash is missing', async () => {
    const request = new NextRequest('http://localhost/api/stream/prefetch', {
      method: 'POST',
      body: JSON.stringify({
        fileIndex: 0,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required parameter: infohash');
  });

  it('should return 400 if fileIndex is missing', async () => {
    const request = new NextRequest('http://localhost/api/stream/prefetch', {
      method: 'POST',
      body: JSON.stringify({
        infohash: '1234567890abcdef1234567890abcdef12345678',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('fileIndex must be a non-negative integer');
  });

  it('should return 400 if fileIndex is negative', async () => {
    const request = new NextRequest('http://localhost/api/stream/prefetch', {
      method: 'POST',
      body: JSON.stringify({
        infohash: '1234567890abcdef1234567890abcdef12345678',
        fileIndex: -1,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('fileIndex must be a non-negative integer');
  });

  it('should handle streaming service errors', async () => {
    const { getStreamingService } = await import('@/lib/streaming');
    vi.mocked(getStreamingService).mockReturnValueOnce({
      getStreamInfo: vi.fn().mockRejectedValue(new Error('Connection failed')),
    } as unknown as ReturnType<typeof getStreamingService>);

    const request = new NextRequest('http://localhost/api/stream/prefetch', {
      method: 'POST',
      body: JSON.stringify({
        infohash: '1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to prefetch file');
  });

  it('should use fallback magnet URI if not found in database', async () => {
    const { getTorrentByInfohash } = await import('@/lib/supabase');
    vi.mocked(getTorrentByInfohash).mockResolvedValueOnce(null);

    const request = new NextRequest('http://localhost/api/stream/prefetch', {
      method: 'POST',
      body: JSON.stringify({
        infohash: 'abcdef1234567890abcdef1234567890abcdef12',
        fileIndex: 1,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
