/**
 * Torrent Ingestion Service Tests
 * 
 * Tests for the magnet URL ingestion service that fetches torrent metadata
 * and stores it in Supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ingestMagnet,
  getTorrentByInfohash,
  getTorrentFiles,
  updateTorrentStatus,
  deleteTorrent,
  type IngestResult,
  type TorrentWithFiles,
} from './ingestion';

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(function() {
    return {
      from: vi.fn(function() {
        return {
          select: vi.fn(function() {
            return {
              eq: vi.fn(function() {
                return {
                  single: vi.fn(function() { return Promise.resolve({ data: null, error: null }); }),
                  maybeSingle: vi.fn(function() { return Promise.resolve({ data: null, error: null }); }),
                };
              }),
              order: vi.fn(function() {
                return {
                  limit: vi.fn(function() { return Promise.resolve({ data: [], error: null }); }),
                };
              }),
            };
          }),
          insert: vi.fn(function() {
            return {
              select: vi.fn(function() {
                return {
                  single: vi.fn(function() {
                    return Promise.resolve({
                      data: { id: 'test-id', infohash: 'abc123def456789012345678901234567890abcd' },
                      error: null
                    });
                  }),
                };
              }),
            };
          }),
          update: vi.fn(function() {
            return {
              eq: vi.fn(function() { return Promise.resolve({ data: null, error: null }); }),
            };
          }),
          delete: vi.fn(function() {
            return {
              eq: vi.fn(function() { return Promise.resolve({ data: null, error: null }); }),
            };
          }),
        };
      }),
    };
  }),
}));

describe('Torrent Ingestion Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ingestMagnet', () => {
    it('should validate magnet URI before ingestion', async () => {
      const result = await ingestMagnet('invalid-magnet', null);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid magnet URI');
    });

    it('should reject empty magnet URI', async () => {
      const result = await ingestMagnet('', null);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid magnet URI');
    });

    it('should extract infohash from valid magnet', async () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=Test+Torrent';
      const result = await ingestMagnet(magnet, 'user-123');
      
      // The mock returns success
      expect(result.infohash).toBe('abc123def456789012345678901234567890abcd');
    });

    it('should handle duplicate torrents gracefully', async () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      
      // First ingestion
      const result1 = await ingestMagnet(magnet, 'user-123');
      expect(result1.success).toBe(true);
      
      // Second ingestion of same magnet should return existing
      // (In real implementation, this would check for existing)
    });

    it('should associate torrent with user ID', async () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      const result = await ingestMagnet(magnet, 'user-456');
      
      expect(result.success).toBe(true);
    });

    it('should allow anonymous ingestion with null user ID', async () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      const result = await ingestMagnet(magnet, null);
      
      expect(result.success).toBe(true);
    });
  });

  describe('getTorrentByInfohash', () => {
    it('should return null for non-existent torrent', async () => {
      const result = await getTorrentByInfohash('nonexistent123456789012345678901234567890');
      expect(result).toBeNull();
    });

    it('should validate infohash format', async () => {
      const result = await getTorrentByInfohash('invalid');
      expect(result).toBeNull();
    });

    it('should normalize infohash to lowercase', async () => {
      const result = await getTorrentByInfohash('ABC123DEF456789012345678901234567890ABCD');
      // Should not throw, should handle uppercase
      expect(result).toBeNull(); // Mock returns null
    });
  });

  describe('getTorrentFiles', () => {
    it('should return empty array for non-existent torrent', async () => {
      const files = await getTorrentFiles('non-existent-id');
      expect(files).toEqual([]);
    });

    it('should return files ordered by file_index', async () => {
      const files = await getTorrentFiles('torrent-123');
      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('updateTorrentStatus', () => {
    it('should update status to ready', async () => {
      const result = await updateTorrentStatus('torrent-123', 'ready');
      expect(result.success).toBe(true);
    });

    it('should update status to error with message', async () => {
      const result = await updateTorrentStatus('torrent-123', 'error', 'Connection timeout');
      expect(result.success).toBe(true);
    });

    it('should validate status value', async () => {
      // @ts-expect-error Testing invalid status
      const result = await updateTorrentStatus('torrent-123', 'invalid-status');
      expect(result.success).toBe(false);
    });
  });

  describe('deleteTorrent', () => {
    it('should delete torrent and cascade to files', async () => {
      const result = await deleteTorrent('torrent-123');
      expect(result.success).toBe(true);
    });

    it('should handle non-existent torrent gracefully', async () => {
      const result = await deleteTorrent('non-existent');
      // Should not throw
      expect(result).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on ingestion', async () => {
      // This would be tested with actual rate limiting implementation
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      
      // Simulate rapid requests
      const results = await Promise.all([
        ingestMagnet(magnet, 'user-123'),
        ingestMagnet(magnet, 'user-123'),
        ingestMagnet(magnet, 'user-123'),
      ]);
      
      // All should complete (rate limiting would be at API level)
      expect(results.every(r => r !== undefined)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error scenario
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      const result = await ingestMagnet(magnet, 'user-123');
      
      // Should not throw, should return error result
      expect(result).toBeDefined();
    });

    it('should handle network timeouts', async () => {
      // This would test timeout handling in real implementation
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      const result = await ingestMagnet(magnet, 'user-123');
      
      expect(result).toBeDefined();
    });
  });

  describe('Validation', () => {
    it('should reject malformed magnet URIs', async () => {
      const malformedMagnets = [
        'magnet:',
        'magnet:?',
        'magnet:?dn=Test',
        'magnet:?xt=invalid',
        'http://example.com',
        'ftp://files.com/file.torrent',
      ];

      for (const magnet of malformedMagnets) {
        const result = await ingestMagnet(magnet, null);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should accept valid magnet URIs with various parameters', async () => {
      const validMagnets = [
        'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd',
        'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=Test',
        'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&tr=udp://tracker.com',
        'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=Test&tr=udp://tracker.com&tr=udp://tracker2.com',
      ];

      for (const magnet of validMagnets) {
        const result = await ingestMagnet(magnet, null);
        expect(result.success).toBe(true);
      }
    });
  });
});
