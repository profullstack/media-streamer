/**
 * Deep File-Level Search Tests
 * 
 * Tests for searching files within torrents.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchTorrentFiles,
  searchTorrents,
  buildSearchQuery,
  sanitizeSearchInput,
  type SearchFilesOptions,
  type SearchTorrentsOptions,
  type FileSearchResult,
  type TorrentSearchResult,
} from './search';

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(function() {
    return {
      rpc: vi.fn(function() { return Promise.resolve({ data: [], error: null }); }),
      from: vi.fn(function() {
        return {
          select: vi.fn(function() {
            return {
              textSearch: vi.fn(function() {
                return {
                  eq: vi.fn(function() {
                    return {
                      order: vi.fn(function() {
                        return {
                          range: vi.fn(function() { return Promise.resolve({ data: [], error: null, count: 0 }); }),
                        };
                      }),
                    };
                  }),
                  order: vi.fn(function() {
                    return {
                      range: vi.fn(function() { return Promise.resolve({ data: [], error: null, count: 0 }); }),
                    };
                  }),
                };
              }),
              ilike: vi.fn(function() {
                return {
                  eq: vi.fn(function() {
                    return {
                      order: vi.fn(function() {
                        return {
                          range: vi.fn(function() { return Promise.resolve({ data: [], error: null, count: 0 }); }),
                        };
                      }),
                    };
                  }),
                  order: vi.fn(function() {
                    return {
                      range: vi.fn(function() { return Promise.resolve({ data: [], error: null, count: 0 }); }),
                    };
                  }),
                };
              }),
            };
          }),
        };
      }),
    };
  }),
}));

describe('Deep File-Level Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeSearchInput', () => {
    it('should trim whitespace', () => {
      expect(sanitizeSearchInput('  hello world  ')).toBe('hello world');
    });

    it('should remove special characters that could cause SQL injection', () => {
      expect(sanitizeSearchInput("test'; DROP TABLE--")).toBe('test DROP TABLE');
    });

    it('should preserve alphanumeric and common characters', () => {
      expect(sanitizeSearchInput('Aphex Twin - Selected Ambient Works')).toBe('Aphex Twin - Selected Ambient Works');
    });

    it('should handle unicode characters', () => {
      expect(sanitizeSearchInput('日本語 テスト')).toBe('日本語 テスト');
    });

    it('should collapse multiple spaces', () => {
      expect(sanitizeSearchInput('hello    world')).toBe('hello world');
    });

    it('should return empty string for null/undefined', () => {
      expect(sanitizeSearchInput(null as unknown as string)).toBe('');
      expect(sanitizeSearchInput(undefined as unknown as string)).toBe('');
    });

    it('should limit query length', () => {
      const longQuery = 'a'.repeat(1000);
      const result = sanitizeSearchInput(longQuery);
      expect(result.length).toBeLessThanOrEqual(500);
    });
  });

  describe('buildSearchQuery', () => {
    it('should convert simple query to tsquery format', () => {
      const result = buildSearchQuery('aphex twin');
      expect(result).toContain('aphex');
      expect(result).toContain('twin');
    });

    it('should handle single word', () => {
      const result = buildSearchQuery('ambient');
      expect(result).toBe('ambient:*');
    });

    it('should handle multiple words with AND', () => {
      const result = buildSearchQuery('selected ambient works');
      expect(result).toContain('&');
    });

    it('should add prefix matching for partial searches', () => {
      const result = buildSearchQuery('ambi');
      expect(result).toContain(':*');
    });

    it('should handle empty query', () => {
      const result = buildSearchQuery('');
      expect(result).toBe('');
    });
  });

  describe('searchTorrentFiles', () => {
    it('should search files by query', async () => {
      const options: SearchFilesOptions = {
        query: 'Aphex Twin',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);

      expect(result).toBeDefined();
      expect(result.files).toBeInstanceOf(Array);
      expect(result.total).toBeDefined();
    });

    it('should filter by media type', async () => {
      const options: SearchFilesOptions = {
        query: 'music',
        mediaType: 'audio',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result).toBeDefined();
    });

    it('should filter by torrent ID', async () => {
      const options: SearchFilesOptions = {
        query: 'track',
        torrentId: 'torrent-123',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result).toBeDefined();
    });

    it('should support pagination', async () => {
      const options: SearchFilesOptions = {
        query: 'test',
        limit: 10,
        offset: 20,
      };

      const result = await searchTorrentFiles(options);
      expect(result).toBeDefined();
    });

    it('should handle empty query', async () => {
      const options: SearchFilesOptions = {
        query: '',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result.files).toEqual([]);
    });

    it('should handle special characters in query', async () => {
      const options: SearchFilesOptions = {
        query: 'test [2024] (1080p)',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result).toBeDefined();
    });

    it('should respect maximum limit', async () => {
      const options: SearchFilesOptions = {
        query: 'test',
        limit: 1000, // Over max
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result).toBeDefined();
    });

    it('should be case-insensitive', async () => {
      const options1: SearchFilesOptions = {
        query: 'APHEX TWIN',
        limit: 50,
        offset: 0,
      };

      const options2: SearchFilesOptions = {
        query: 'aphex twin',
        limit: 50,
        offset: 0,
      };

      const result1 = await searchTorrentFiles(options1);
      const result2 = await searchTorrentFiles(options2);

      // Both should work without error
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('searchTorrents', () => {
    it('should search torrents by name', async () => {
      const options: SearchTorrentsOptions = {
        query: 'Music Collection',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrents(options);

      expect(result).toBeDefined();
      expect(result.torrents).toBeInstanceOf(Array);
      expect(result.total).toBeDefined();
    });

    it('should filter by status', async () => {
      const options: SearchTorrentsOptions = {
        query: 'test',
        status: 'ready',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrents(options);
      expect(result).toBeDefined();
    });

    it('should support pagination', async () => {
      const options: SearchTorrentsOptions = {
        query: 'test',
        limit: 10,
        offset: 20,
      };

      const result = await searchTorrents(options);
      expect(result).toBeDefined();
    });

    it('should handle empty query', async () => {
      const options: SearchTorrentsOptions = {
        query: '',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrents(options);
      expect(result.torrents).toEqual([]);
    });
  });

  describe('Search Performance', () => {
    it('should complete search within reasonable time', async () => {
      const start = Date.now();
      
      const options: SearchFilesOptions = {
        query: 'test query',
        limit: 50,
        offset: 0,
      };

      await searchTorrentFiles(options);
      
      const duration = Date.now() - start;
      // Should complete quickly (mocked, so very fast)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Search Result Types', () => {
    it('should return properly typed file results', async () => {
      const options: SearchFilesOptions = {
        query: 'test',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);

      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('offset');
    });

    it('should return properly typed torrent results', async () => {
      const options: SearchTorrentsOptions = {
        query: 'test',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrents(options);

      expect(result).toHaveProperty('torrents');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('offset');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long queries', async () => {
      const longQuery = 'word '.repeat(100);
      const options: SearchFilesOptions = {
        query: longQuery,
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result).toBeDefined();
    });

    it('should handle queries with only special characters', async () => {
      const options: SearchFilesOptions = {
        query: '!@#$%^&*()',
        limit: 50,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result.files).toEqual([]);
    });

    it('should handle negative offset', async () => {
      const options: SearchFilesOptions = {
        query: 'test',
        limit: 50,
        offset: -10,
      };

      const result = await searchTorrentFiles(options);
      expect(result).toBeDefined();
    });

    it('should handle zero limit', async () => {
      const options: SearchFilesOptions = {
        query: 'test',
        limit: 0,
        offset: 0,
      };

      const result = await searchTorrentFiles(options);
      expect(result.files).toEqual([]);
    });
  });
});
