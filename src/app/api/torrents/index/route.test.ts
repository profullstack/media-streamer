import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
  generateRequestId: vi.fn(() => 'test-request-id'),
}));

// Mock magnet utilities
vi.mock('@/lib/magnet', () => ({
  parseMagnetUri: vi.fn((uri: string) => ({
    infohash: '1234567890abcdef1234567890abcdef12345678',
    displayName: 'Test Torrent',
    trackers: ['udp://tracker.example.com:6969'],
    originalUri: uri,
  })),
  validateMagnetUri: vi.fn((uri: string) => uri.startsWith('magnet:?xt=urn:btih:')),
}));

// Mock tracker scrape
vi.mock('@/lib/tracker-scrape', () => ({
  scrapeMultipleTrackers: vi.fn().mockResolvedValue({
    seeders: 10,
    leechers: 5,
    fetchedAt: new Date(),
    trackersResponded: 3,
  }),
  SCRAPE_TRACKERS: ['udp://tracker.example.com:6969'],
}));

// Mock Supabase operations
const mockGetTorrentByInfohash = vi.fn();
const mockCreateTorrent = vi.fn();
const mockCreateTorrentFiles = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getTorrentByInfohash: (...args: unknown[]) => mockGetTorrentByInfohash(...args),
  createTorrent: (...args: unknown[]) => mockCreateTorrent(...args),
  createTorrentFiles: (...args: unknown[]) => mockCreateTorrentFiles(...args),
}));

// Mock TorrentService
const mockFetchMetadata = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@/lib/torrent', () => ({
  TorrentService: vi.fn(() => ({
    fetchMetadata: mockFetchMetadata,
    destroy: mockDestroy,
  })),
}));

import { POST } from './route';

describe('Torrents Index API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTorrentByInfohash.mockResolvedValue(null);
    mockCreateTorrent.mockResolvedValue({
      id: 'torrent-uuid-123',
      infohash: '1234567890abcdef1234567890abcdef12345678',
      name: 'Test Torrent',
      file_count: 2,
      total_size: 1000000,
    });
    mockCreateTorrentFiles.mockResolvedValue(undefined);
    mockFetchMetadata.mockResolvedValue({
      infohash: '1234567890abcdef1234567890abcdef12345678',
      name: 'Test Torrent',
      totalSize: 1000000,
      pieceLength: 16384,
      files: [
        {
          index: 0,
          name: 'file1.mp4',
          path: 'Test Torrent/file1.mp4',
          size: 500000,
          offset: 0,
          pieceStart: 0,
          pieceEnd: 30,
          extension: 'mp4',
          mediaCategory: 'video',
          mimeType: 'video/mp4',
        },
        {
          index: 1,
          name: 'file2.mp4',
          path: 'Test Torrent/file2.mp4',
          size: 500000,
          offset: 500000,
          pieceStart: 30,
          pieceEnd: 60,
          extension: 'mp4',
          mediaCategory: 'video',
          mimeType: 'video/mp4',
        },
      ],
      magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
      seeders: null,
      leechers: null,
    });
    mockDestroy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/torrents/index', () => {
    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
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

    it('should return 400 for missing magnetUri', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
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
      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
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

    it('should return 400 for invalid magnet URI format', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({ magnetUri: 'invalid-magnet' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid magnet URI format');
    });

    it('should return SSE stream with existing event for already indexed torrent', async () => {
      mockGetTorrentByInfohash.mockResolvedValue({
        id: 'existing-torrent-uuid',
        infohash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Existing Torrent',
        file_count: 5,
        total_size: 2000000,
      });

      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('event: existing');
      expect(text).toContain('existing-torrent-uuid');
    });

    it('should return SSE stream with complete event for new torrent', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read all events
      let fullText = '';
      let done = false;
      while (!done) {
        const result = await reader!.read();
        done = result.done;
        if (result.value) {
          fullText += new TextDecoder().decode(result.value);
        }
      }

      expect(fullText).toContain('event: complete');
      expect(fullText).toContain('torrent-uuid-123');
      expect(fullText).toContain('isNew');
    });

    it('should handle fetch errors gracefully and send error event', async () => {
      mockFetchMetadata.mockRejectedValue(new TypeError('fetch failed'));

      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read all events
      let fullText = '';
      let done = false;
      while (!done) {
        const result = await reader!.read();
        done = result.done;
        if (result.value) {
          fullText += new TextDecoder().decode(result.value);
        }
      }

      expect(fullText).toContain('event: error');
      expect(fullText).toContain('fetch failed');
    });

    it('should handle database errors gracefully and send error event', async () => {
      mockCreateTorrent.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read all events
      let fullText = '';
      let done = false;
      while (!done) {
        const result = await reader!.read();
        done = result.done;
        if (result.value) {
          fullText += new TextDecoder().decode(result.value);
        }
      }

      expect(fullText).toContain('event: error');
      expect(fullText).toContain('Database connection failed');
    });

    it('should handle torrentService.destroy() errors gracefully', async () => {
      mockDestroy.mockRejectedValue(new Error('Destroy failed'));

      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read all events - should still complete successfully
      let fullText = '';
      let done = false;
      while (!done) {
        const result = await reader!.read();
        done = result.done;
        if (result.value) {
          fullText += new TextDecoder().decode(result.value);
        }
      }

      // The stream should still complete even if destroy fails
      expect(fullText).toContain('event: complete');
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should handle tracker scrape errors gracefully', async () => {
      const { scrapeMultipleTrackers } = await import('@/lib/tracker-scrape');
      vi.mocked(scrapeMultipleTrackers).mockRejectedValue(new Error('Tracker scrape failed'));

      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read all events - should still complete successfully (tracker scrape is optional)
      let fullText = '';
      let done = false;
      while (!done) {
        const result = await reader!.read();
        done = result.done;
        if (result.value) {
          fullText += new TextDecoder().decode(result.value);
        }
      }

      // The stream should still complete even if tracker scrape fails
      expect(fullText).toContain('event: complete');
    });

    it('should handle stream controller errors when connection is closed', async () => {
      // Simulate a scenario where the controller operations might fail
      // This tests that we properly wrap controller.enqueue and controller.close
      mockFetchMetadata.mockImplementation(async (_, onProgress) => {
        // Emit a progress event
        if (onProgress) {
          onProgress({
            stage: 'connecting',
            progress: 0,
            numPeers: 0,
            elapsedMs: 100,
            message: 'Connecting...',
            infohash: '1234567890abcdef1234567890abcdef12345678',
          });
        }
        return {
          infohash: '1234567890abcdef1234567890abcdef12345678',
          name: 'Test Torrent',
          totalSize: 1000000,
          pieceLength: 16384,
          files: [],
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          seeders: null,
          leechers: null,
        };
      });

      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read all events
      let fullText = '';
      let done = false;
      while (!done) {
        const result = await reader!.read();
        done = result.done;
        if (result.value) {
          fullText += new TextDecoder().decode(result.value);
        }
      }

      expect(fullText).toContain('event: progress');
      expect(fullText).toContain('event: complete');
    });

    it('should call destroy even when an error occurs', async () => {
      mockFetchMetadata.mockRejectedValue(new Error('Metadata fetch failed'));

      const request = new NextRequest('http://localhost:3000/api/torrents/index', {
        method: 'POST',
        body: JSON.stringify({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const reader = response.body?.getReader();

      // Read all events to completion
      let done = false;
      while (!done) {
        const result = await reader!.read();
        done = result.done;
      }

      // Verify destroy was called even after error
      expect(mockDestroy).toHaveBeenCalled();
    });
  });
});
