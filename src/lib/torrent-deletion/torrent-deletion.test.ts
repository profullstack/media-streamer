import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateInfohash,
  formatBytes,
  getTorrentByInfohash,
  getFileIds,
  countRelatedRecords,
  deleteTorrentById,
  deleteTorrentByInfohash,
} from './torrent-deletion.js';

// Mock Supabase client
function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe('torrent-deletion', () => {
  describe('validateInfohash', () => {
    it('should return true for valid lowercase infohash', () => {
      const infohash = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';
      expect(validateInfohash(infohash)).toBe(true);
    });

    it('should return true for valid uppercase infohash', () => {
      const infohash = 'DD8255ECDC7CA55FB0BBF81323D87062DB1F6D1C';
      expect(validateInfohash(infohash)).toBe(true);
    });

    it('should return true for valid mixed case infohash', () => {
      const infohash = 'Dd8255EcdC7ca55Fb0bbF81323d87062Db1f6d1C';
      expect(validateInfohash(infohash)).toBe(true);
    });

    it('should return false for infohash that is too short', () => {
      const infohash = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1';
      expect(validateInfohash(infohash)).toBe(false);
    });

    it('should return false for infohash that is too long', () => {
      const infohash = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c0';
      expect(validateInfohash(infohash)).toBe(false);
    });

    it('should return false for infohash with invalid characters', () => {
      const infohash = 'gg8255ecdc7ca55fb0bbf81323d87062db1f6d1c';
      expect(validateInfohash(infohash)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateInfohash('')).toBe(false);
    });

    it('should return false for non-hex string', () => {
      expect(validateInfohash('not-a-valid-infohash-at-all!!')).toBe(false);
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(263640000)).toBe('251.43 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(5368709120)).toBe('5 GB');
    });

    it('should format terabytes', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });
  });

  describe('getTorrentByInfohash', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>;

    beforeEach(() => {
      mockSupabase = createMockSupabase();
    });

    it('should return torrent when found', async () => {
      const mockTorrent = {
        id: 'uuid-123',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        name: 'Test Torrent',
        file_count: 3,
        total_size: 1000000,
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
          }),
        }),
      });

      const result = await getTorrentByInfohash(
        mockSupabase as unknown as Parameters<typeof getTorrentByInfohash>[0],
        'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
      );

      expect(result).toEqual(mockTorrent);
      expect(mockSupabase.from).toHaveBeenCalledWith('bt_torrents');
    });

    it('should return null when torrent not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows returned' },
            }),
          }),
        }),
      });

      const result = await getTorrentByInfohash(
        mockSupabase as unknown as Parameters<typeof getTorrentByInfohash>[0],
        'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
      );

      expect(result).toBeNull();
    });

    it('should throw error on database error', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'OTHER', message: 'Database error' },
            }),
          }),
        }),
      });

      await expect(
        getTorrentByInfohash(
          mockSupabase as unknown as Parameters<typeof getTorrentByInfohash>[0],
          'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
        )
      ).rejects.toThrow('Failed to fetch torrent: Database error');
    });

    it('should convert infohash to lowercase', async () => {
      const mockTorrent = {
        id: 'uuid-123',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        name: 'Test Torrent',
        file_count: 3,
        total_size: 1000000,
      };

      const eqMock = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: eqMock,
        }),
      });

      await getTorrentByInfohash(
        mockSupabase as unknown as Parameters<typeof getTorrentByInfohash>[0],
        'DD8255ECDC7CA55FB0BBF81323D87062DB1F6D1C'
      );

      expect(eqMock).toHaveBeenCalledWith('infohash', 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c');
    });
  });

  describe('getFileIds', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>;

    beforeEach(() => {
      mockSupabase = createMockSupabase();
    });

    it('should return array of file IDs', async () => {
      const mockFiles = [
        { id: 'file-1' },
        { id: 'file-2' },
        { id: 'file-3' },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
        }),
      });

      const result = await getFileIds(
        mockSupabase as unknown as Parameters<typeof getFileIds>[0],
        'torrent-uuid'
      );

      expect(result).toEqual(['file-1', 'file-2', 'file-3']);
      expect(mockSupabase.from).toHaveBeenCalledWith('bt_torrent_files');
    });

    it('should return empty array when no files', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const result = await getFileIds(
        mockSupabase as unknown as Parameters<typeof getFileIds>[0],
        'torrent-uuid'
      );

      expect(result).toEqual([]);
    });

    it('should throw error on database error', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      });

      await expect(
        getFileIds(
          mockSupabase as unknown as Parameters<typeof getFileIds>[0],
          'torrent-uuid'
        )
      ).rejects.toThrow('Failed to fetch file IDs: Database error');
    });
  });

  describe('countRelatedRecords', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>;

    beforeEach(() => {
      mockSupabase = createMockSupabase();
    });

    it('should return zero counts for empty file IDs', async () => {
      const result = await countRelatedRecords(
        mockSupabase as unknown as Parameters<typeof countRelatedRecords>[0],
        []
      );

      expect(result).toEqual({
        audioMetadata: 0,
        videoMetadata: 0,
        ebookMetadata: 0,
        favorites: 0,
        collectionItems: 0,
        readingProgress: 0,
        watchProgress: 0,
      });

      // Should not call database
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should return counts for all related tables', async () => {
      const createCountMock = (count: number) => ({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ count, error: null }),
        }),
      });

      let callIndex = 0;
      const counts = [2, 1, 0, 5, 3, 1, 2]; // audio, video, ebook, favorites, collection, reading, watch

      mockSupabase.from.mockImplementation(() => createCountMock(counts[callIndex++]));

      const result = await countRelatedRecords(
        mockSupabase as unknown as Parameters<typeof countRelatedRecords>[0],
        ['file-1', 'file-2']
      );

      expect(result).toEqual({
        audioMetadata: 2,
        videoMetadata: 1,
        ebookMetadata: 0,
        favorites: 5,
        collectionItems: 3,
        readingProgress: 1,
        watchProgress: 2,
      });
    });

    it('should handle null counts as zero', async () => {
      const createCountMock = () => ({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ count: null, error: null }),
        }),
      });

      mockSupabase.from.mockImplementation(() => createCountMock());

      const result = await countRelatedRecords(
        mockSupabase as unknown as Parameters<typeof countRelatedRecords>[0],
        ['file-1']
      );

      expect(result).toEqual({
        audioMetadata: 0,
        videoMetadata: 0,
        ebookMetadata: 0,
        favorites: 0,
        collectionItems: 0,
        readingProgress: 0,
        watchProgress: 0,
      });
    });
  });

  describe('deleteTorrentById', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>;

    beforeEach(() => {
      mockSupabase = createMockSupabase();
    });

    it('should delete torrent successfully', async () => {
      mockSupabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      await expect(
        deleteTorrentById(
          mockSupabase as unknown as Parameters<typeof deleteTorrentById>[0],
          'torrent-uuid'
        )
      ).resolves.toBeUndefined();

      expect(mockSupabase.from).toHaveBeenCalledWith('bt_torrents');
    });

    it('should throw error on database error', async () => {
      mockSupabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Delete failed' },
          }),
        }),
      });

      await expect(
        deleteTorrentById(
          mockSupabase as unknown as Parameters<typeof deleteTorrentById>[0],
          'torrent-uuid'
        )
      ).rejects.toThrow('Failed to delete torrent: Delete failed');
    });
  });

  describe('deleteTorrentByInfohash', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>;

    beforeEach(() => {
      mockSupabase = createMockSupabase();
    });

    it('should throw error for invalid infohash', async () => {
      await expect(
        deleteTorrentByInfohash(
          mockSupabase as unknown as Parameters<typeof deleteTorrentByInfohash>[0],
          'invalid'
        )
      ).rejects.toThrow('Invalid infohash format');
    });

    it('should throw error when torrent not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows' },
            }),
          }),
        }),
      });

      await expect(
        deleteTorrentByInfohash(
          mockSupabase as unknown as Parameters<typeof deleteTorrentByInfohash>[0],
          'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
        )
      ).rejects.toThrow('Torrent not found with infohash');
    });

    it('should delete torrent and return deletion result', async () => {
      const mockTorrent = {
        id: 'uuid-123',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        name: 'Test Torrent',
        file_count: 3,
        total_size: 1000000,
      };

      const mockFiles = [{ id: 'file-1' }, { id: 'file-2' }, { id: 'file-3' }];

      // Track which table is being queried
      let queryCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'bt_torrents') {
          queryCount++;
          if (queryCount === 1) {
            // First call: getTorrentByInfohash
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
                }),
              }),
            };
          } else {
            // Later call: deleteTorrentById
            return {
              delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
        }

        if (table === 'bt_torrent_files') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
            }),
          };
        }

        // Metadata and progress tables
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        };
      });

      const result = await deleteTorrentByInfohash(
        mockSupabase as unknown as Parameters<typeof deleteTorrentByInfohash>[0],
        'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
      );

      expect(result.torrent).toEqual(mockTorrent);
      expect(result.fileCount).toBe(3);
      expect(result.totalDeleted).toBe(4); // 1 torrent + 3 files + 0 metadata
      expect(result.relatedCounts).toEqual({
        audioMetadata: 0,
        videoMetadata: 0,
        ebookMetadata: 0,
        favorites: 0,
        collectionItems: 0,
        readingProgress: 0,
        watchProgress: 0,
      });
    });

    it('should calculate total deleted including all related records', async () => {
      const mockTorrent = {
        id: 'uuid-123',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        name: 'Test Torrent',
        file_count: 2,
        total_size: 1000000,
      };

      const mockFiles = [{ id: 'file-1' }, { id: 'file-2' }];

      let queryCount = 0;
      let metadataQueryIndex = 0;
      const metadataCounts = [1, 1, 0, 2, 1, 1, 1]; // audio, video, ebook, favorites, collection, reading, watch

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'bt_torrents') {
          queryCount++;
          if (queryCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
                }),
              }),
            };
          } else {
            return {
              delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
        }

        if (table === 'bt_torrent_files') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
            }),
          };
        }

        // Metadata and progress tables
        const count = metadataCounts[metadataQueryIndex++];
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ count, error: null }),
          }),
        };
      });

      const result = await deleteTorrentByInfohash(
        mockSupabase as unknown as Parameters<typeof deleteTorrentByInfohash>[0],
        'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
      );

      // 1 torrent + 2 files + 1 audio + 1 video + 0 ebook + 2 favorites + 1 collection + 1 reading + 1 watch = 10
      expect(result.totalDeleted).toBe(10);
      expect(result.relatedCounts).toEqual({
        audioMetadata: 1,
        videoMetadata: 1,
        ebookMetadata: 0,
        favorites: 2,
        collectionItems: 1,
        readingProgress: 1,
        watchProgress: 1,
      });
    });
  });
});
