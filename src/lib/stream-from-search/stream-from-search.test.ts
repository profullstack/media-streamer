/**
 * Stream From Search Tests
 * 
 * Tests for streaming files directly from search results
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createStreamSession,
  getStreamSession,
  destroyStreamSession,
  prioritizeFilePieces,
  StreamSession,
  StreamSessionError,
  validateStreamRequest,
} from './stream-from-search';

// Mock the torrent client
vi.mock('@/lib/torrent', () => ({
  TorrentClient: vi.fn(() => ({
    addMagnet: vi.fn(),
    prioritizePieces: vi.fn(),
    getFileStream: vi.fn(),
    destroy: vi.fn(),
  })),
}));

describe('Stream From Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateStreamRequest', () => {
    it('should validate a valid stream request', () => {
      const result = validateStreamRequest({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject missing torrentId', () => {
      const result = validateStreamRequest({
        torrentId: '',
        filePath: '/Music/track.mp3',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('torrentId is required');
    });

    it('should reject missing filePath', () => {
      const result = validateStreamRequest({
        torrentId: 'torrent-123',
        filePath: '',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('filePath is required');
    });

    it('should reject path traversal attempts', () => {
      const result = validateStreamRequest({
        torrentId: 'torrent-123',
        filePath: '../../../etc/passwd',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid file path');
    });

    it('should reject null bytes in path', () => {
      const result = validateStreamRequest({
        torrentId: 'torrent-123',
        filePath: '/Music/track\x00.mp3',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid file path');
    });
  });

  describe('createStreamSession', () => {
    it('should create a new stream session', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.torrentId).toBe('torrent-123');
      expect(session.filePath).toBe('/Music/track.mp3');
      expect(session.status).toBe('initializing');
    });

    it('should generate unique session IDs', async () => {
      const session1 = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track1.mp3',
        infohash: 'a'.repeat(40),
      });

      const session2 = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track2.mp3',
        infohash: 'a'.repeat(40),
      });

      expect(session1.id).not.toBe(session2.id);

      // Cleanup
      await destroyStreamSession(session1.id);
      await destroyStreamSession(session2.id);
    });

    it('should track creation timestamp', async () => {
      const before = Date.now();
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });
      const after = Date.now();

      expect(session.createdAt).toBeGreaterThanOrEqual(before);
      expect(session.createdAt).toBeLessThanOrEqual(after);

      await destroyStreamSession(session.id);
    });

    it('should throw error for invalid infohash', async () => {
      await expect(
        createStreamSession({
          torrentId: 'torrent-123',
          filePath: '/Music/track.mp3',
          infohash: 'invalid',
        })
      ).rejects.toThrow(StreamSessionError);
    });
  });

  describe('getStreamSession', () => {
    it('should retrieve an existing session', async () => {
      const created = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      const retrieved = getStreamSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.torrentId).toBe(created.torrentId);

      await destroyStreamSession(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const session = getStreamSession('non-existent-id');
      expect(session).toBeUndefined();
    });
  });

  describe('destroyStreamSession', () => {
    it('should destroy an existing session', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      await destroyStreamSession(session.id);

      const retrieved = getStreamSession(session.id);
      expect(retrieved).toBeUndefined();
    });

    it('should handle destroying non-existent session gracefully', async () => {
      // Should not throw
      await expect(destroyStreamSession('non-existent-id')).resolves.not.toThrow();
    });

    it('should cleanup resources on destroy', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      await destroyStreamSession(session.id);

      // Session should be removed
      expect(getStreamSession(session.id)).toBeUndefined();
    });
  });

  describe('prioritizeFilePieces', () => {
    it('should prioritize pieces for a specific file', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      const result = await prioritizeFilePieces(session.id, {
        startPiece: 0,
        endPiece: 100,
        priority: 'high',
      });

      expect(result.success).toBe(true);
      expect(result.prioritizedPieces).toBe(101);

      await destroyStreamSession(session.id);
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        prioritizeFilePieces('non-existent', {
          startPiece: 0,
          endPiece: 100,
          priority: 'high',
        })
      ).rejects.toThrow(StreamSessionError);
    });

    it('should validate piece range', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      await expect(
        prioritizeFilePieces(session.id, {
          startPiece: 100,
          endPiece: 50, // Invalid: end < start
          priority: 'high',
        })
      ).rejects.toThrow('Invalid piece range');

      await destroyStreamSession(session.id);
    });

    it('should support different priority levels', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      const highResult = await prioritizeFilePieces(session.id, {
        startPiece: 0,
        endPiece: 10,
        priority: 'high',
      });
      expect(highResult.success).toBe(true);

      const normalResult = await prioritizeFilePieces(session.id, {
        startPiece: 11,
        endPiece: 20,
        priority: 'normal',
      });
      expect(normalResult.success).toBe(true);

      const lowResult = await prioritizeFilePieces(session.id, {
        startPiece: 21,
        endPiece: 30,
        priority: 'low',
      });
      expect(lowResult.success).toBe(true);

      await destroyStreamSession(session.id);
    });
  });

  describe('Concurrent Stream Isolation', () => {
    it('should isolate concurrent streams', async () => {
      const session1 = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track1.mp3',
        infohash: 'a'.repeat(40),
      });

      const session2 = await createStreamSession({
        torrentId: 'torrent-456',
        filePath: '/Music/track2.mp3',
        infohash: 'b'.repeat(40),
      });

      // Sessions should be independent
      expect(session1.id).not.toBe(session2.id);
      expect(session1.torrentId).not.toBe(session2.torrentId);

      // Destroying one should not affect the other
      await destroyStreamSession(session1.id);
      expect(getStreamSession(session1.id)).toBeUndefined();
      expect(getStreamSession(session2.id)).toBeDefined();

      await destroyStreamSession(session2.id);
    });

    it('should handle multiple streams from same torrent', async () => {
      const infohash = 'a'.repeat(40);

      const session1 = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track1.mp3',
        infohash,
      });

      const session2 = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track2.mp3',
        infohash,
      });

      // Both sessions should exist
      expect(getStreamSession(session1.id)).toBeDefined();
      expect(getStreamSession(session2.id)).toBeDefined();

      // Different files from same torrent
      expect(session1.filePath).not.toBe(session2.filePath);
      expect(session1.torrentId).toBe(session2.torrentId);

      await destroyStreamSession(session1.id);
      await destroyStreamSession(session2.id);
    });
  });

  describe('Session Status Tracking', () => {
    it('should track session status transitions', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      expect(session.status).toBe('initializing');

      // Status should be retrievable
      const retrieved = getStreamSession(session.id);
      expect(retrieved?.status).toBe('initializing');

      await destroyStreamSession(session.id);
    });
  });

  describe('Session Timeout', () => {
    it('should track last activity timestamp', async () => {
      const session = await createStreamSession({
        torrentId: 'torrent-123',
        filePath: '/Music/track.mp3',
        infohash: 'a'.repeat(40),
      });

      expect(session.lastActivity).toBeDefined();
      expect(session.lastActivity).toBeGreaterThan(0);

      await destroyStreamSession(session.id);
    });
  });

  describe('StreamSessionError', () => {
    it('should create error with message', () => {
      const error = new StreamSessionError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('StreamSessionError');
    });

    it('should be instanceof Error', () => {
      const error = new StreamSessionError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(StreamSessionError);
    });
  });
});
