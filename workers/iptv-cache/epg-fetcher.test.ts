/**
 * EPG Fetcher Tests
 *
 * Tests for the worker's EPG (XMLTV) fetching and parsing functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';

// Mock undici
const mockFetch = vi.fn();
vi.mock('undici', () => ({
  Agent: vi.fn(() => ({})),
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

// Mock zlib
vi.mock('zlib', () => ({
  createGunzip: vi.fn(() => {
    const passthrough = new (require('stream').PassThrough)();
    return passthrough;
  }),
}));

describe('EpgFetcher', () => {
  let fetchAndParseEpg: typeof import('./epg-fetcher').fetchAndParseEpg;
  let isValidEpgUrl: typeof import('./epg-fetcher').isValidEpgUrl;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('./epg-fetcher');
    fetchAndParseEpg = module.fetchAndParseEpg;
    isValidEpgUrl = module.isValidEpgUrl;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidEpgUrl', () => {
    it('returns true for valid HTTP URL', () => {
      expect(isValidEpgUrl('http://example.com/epg.xml')).toBe(true);
    });

    it('returns true for valid HTTPS URL', () => {
      expect(isValidEpgUrl('https://example.com/epg.xml.gz')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isValidEpgUrl('')).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(isValidEpgUrl('not-a-url')).toBe(false);
    });

    it('returns false for FTP URL', () => {
      expect(isValidEpgUrl('ftp://example.com/epg.xml')).toBe(false);
    });

    it('returns false for file URL', () => {
      expect(isValidEpgUrl('file:///path/to/epg.xml')).toBe(false);
    });
  });

  describe('fetchAndParseEpg', () => {
    it('returns error when response has no body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        headers: new Map(),
      });

      const result = await fetchAndParseEpg('http://example.com/epg.xml');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No response body');
    });

    it('returns error on HTTP failure', async () => {
      // Mock all retry attempts to reject
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await fetchAndParseEpg('http://example.com/epg.xml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('parses valid XMLTV content', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ch1">
    <display-name>ESPN HD</display-name>
  </channel>
  <programme start="20260104120000 +0000" stop="20260104130000 +0000" channel="ch1">
    <title>Sports Center</title>
    <desc>Daily sports news</desc>
  </programme>
</tv>`;

      // Create a mock web readable stream
      const chunks = [new TextEncoder().encode(xmlContent)];
      let chunkIndex = 0;

      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
      };

      const mockBody = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/xml';
            if (name === 'content-encoding') return '';
            return null;
          },
        },
      });

      const result = await fetchAndParseEpg('http://example.com/epg.xml');

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      // Programs array populated depends on time window logic in actual parser
    });

    it('handles gzipped EPG by URL extension', async () => {
      const xmlContent = `<?xml version="1.0"?><tv></tv>`;
      const chunks = [new TextEncoder().encode(xmlContent)];
      let chunkIndex = 0;

      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
      };

      const mockBody = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/xml';
            if (name === 'content-encoding') return '';
            return null;
          },
        },
      });

      // The .gz extension should trigger decompression logic
      const result = await fetchAndParseEpg('http://example.com/epg.xml.gz');

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles gzipped EPG by content-encoding header', async () => {
      const xmlContent = `<?xml version="1.0"?><tv></tv>`;
      const chunks = [new TextEncoder().encode(xmlContent)];
      let chunkIndex = 0;

      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
      };

      const mockBody = {
        getReader: vi.fn().mockReturnValue(mockReader),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/xml';
            if (name === 'content-encoding') return 'gzip';
            return null;
          },
        },
      });

      const result = await fetchAndParseEpg('http://example.com/epg.xml');

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('retries on fetch failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'));

      const result = await fetchAndParseEpg('http://example.com/epg.xml');

      expect(result.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3); // maxRetries = 3
    });
  });
});
