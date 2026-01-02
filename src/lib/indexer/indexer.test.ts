 import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TorrentMetadata } from '../torrent';

// Mock dependencies with factory functions that don't reference external variables
vi.mock('../torrent', () => ({
  TorrentService: vi.fn(() => ({
    fetchMetadata: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock('../supabase', () => ({
  getTorrentByInfohash: vi.fn(),
  createTorrent: vi.fn(),
  createTorrentFiles: vi.fn(),
}));

// Import after mocking
import {
  IndexerService,
  IndexerError,
  DuplicateTorrentError,
  type IndexResult,
} from './indexer';
import { TorrentService } from '../torrent';
import { getTorrentByInfohash, createTorrent, createTorrentFiles } from '../supabase';

// Get mocked functions
const mockTorrentService = vi.mocked(TorrentService);
const mockGetTorrentByInfohash = vi.mocked(getTorrentByInfohash);
const mockCreateTorrent = vi.mocked(createTorrent);
const mockCreateTorrentFiles = vi.mocked(createTorrentFiles);

// Helper to create a complete mock torrent object
function createMockTorrent(overrides: Partial<{
  id: string;
  infohash: string;
  magnet_uri: string;
  name: string;
  clean_title: string | null;
  total_size: number;
  file_count: number;
  piece_length: number | null;
}> = {}) {
  return {
    id: 'torrent-uuid-123',
    infohash: '1234567890abcdef1234567890abcdef12345678',
    magnet_uri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        clean_title: null,
    name: 'Test Torrent',
    total_size: 1000000,
    file_count: 2,
    piece_length: 16384,
    seeders: null,
    leechers: null,
    swarm_updated_at: null,
    created_by: null,
    status: 'ready' as const,
    error_message: null,
    indexed_at: '2024-01-01T00:00:00Z',
    poster_url: null,
    cover_url: null,
    content_type: null,
    external_id: null,
    external_source: null,
    year: null,
    description: null,
    metadata_fetched_at: null,
    // Codec fields
    video_codec: null,
    audio_codec: null,
    container: null,
    needs_transcoding: false,
    codec_detected_at: null,
    // Credits fields
    director: null,
    actors: null,
    genre: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('IndexerService', () => {
  let mockFetchMetadata: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock for fetchMetadata
    mockFetchMetadata = vi.fn();
    mockTorrentService.mockImplementation(() => ({
      fetchMetadata: mockFetchMetadata,
      destroy: vi.fn(),
    }) as unknown as TorrentService);
  });

  describe('constructor', () => {
    it('should create an IndexerService instance', () => {
      const service = new IndexerService();
      expect(service).toBeInstanceOf(IndexerService);
    });
  });

  describe('indexMagnet', () => {
    const mockMetadata: TorrentMetadata = {
      infohash: '1234567890abcdef1234567890abcdef12345678',
      name: 'Test Torrent',
      totalSize: 1000000,
      pieceLength: 16384,
      magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
      seeders: null,
      leechers: null,
      files: [
        {
          index: 0,
          name: 'file1.mp3',
          path: 'Test Torrent/file1.mp3',
          size: 500000,
          offset: 0,
          pieceStart: 0,
          pieceEnd: 30,
          extension: 'mp3',
          mediaCategory: 'audio',
          mimeType: 'audio/mpeg',
        },
        {
          index: 1,
          name: 'file2.mp3',
          path: 'Test Torrent/file2.mp3',
          size: 500000,
          offset: 500000,
          pieceStart: 30,
          pieceEnd: 61,
          extension: 'mp3',
          mediaCategory: 'audio',
          mimeType: 'audio/mpeg',
        },
      ],
    };

    it('should index a new torrent successfully', async () => {
      mockFetchMetadata.mockResolvedValue(mockMetadata);
      mockGetTorrentByInfohash.mockResolvedValue(null);
      mockCreateTorrent.mockResolvedValue(createMockTorrent({
        infohash: mockMetadata.infohash,
        magnet_uri: mockMetadata.magnetUri,
        clean_title: null,
        name: mockMetadata.name,
        total_size: mockMetadata.totalSize,
        file_count: 2,
        piece_length: mockMetadata.pieceLength,
      }));
      mockCreateTorrentFiles.mockResolvedValue([]);

      const service = new IndexerService();
      const result = await service.indexMagnet(mockMetadata.magnetUri);

      expect(result.torrentId).toBe('torrent-uuid-123');
      expect(result.infohash).toBe(mockMetadata.infohash);
      expect(result.name).toBe(mockMetadata.name);
      expect(result.fileCount).toBe(2);
      expect(result.totalSize).toBe(1000000);
      expect(result.isNew).toBe(true);
    });

    it('should return existing torrent if already indexed', async () => {
      mockFetchMetadata.mockResolvedValue(mockMetadata);
      mockGetTorrentByInfohash.mockResolvedValue(createMockTorrent({
        id: 'existing-torrent-uuid',
        infohash: mockMetadata.infohash,
        magnet_uri: mockMetadata.magnetUri,
        clean_title: null,
        name: mockMetadata.name,
        total_size: mockMetadata.totalSize,
        file_count: 2,
        piece_length: mockMetadata.pieceLength,
      }));

      const service = new IndexerService();
      const result = await service.indexMagnet(mockMetadata.magnetUri);

      expect(result.torrentId).toBe('existing-torrent-uuid');
      expect(result.isNew).toBe(false);
      expect(mockCreateTorrent).not.toHaveBeenCalled();
      expect(mockCreateTorrentFiles).not.toHaveBeenCalled();
    });

    it('should throw DuplicateTorrentError when skipDuplicates is false', async () => {
      mockFetchMetadata.mockResolvedValue(mockMetadata);
      mockGetTorrentByInfohash.mockResolvedValue(createMockTorrent({
        id: 'existing-torrent-uuid',
        infohash: mockMetadata.infohash,
        magnet_uri: mockMetadata.magnetUri,
        clean_title: null,
        name: mockMetadata.name,
        total_size: mockMetadata.totalSize,
        file_count: 2,
        piece_length: mockMetadata.pieceLength,
      }));

      const service = new IndexerService();
      
      await expect(
        service.indexMagnet(mockMetadata.magnetUri, { skipDuplicates: false })
      ).rejects.toThrow(DuplicateTorrentError);
    });

    it('should throw IndexerError for invalid magnet URI', async () => {
      mockFetchMetadata.mockRejectedValue(new Error('Invalid magnet URI'));

      const service = new IndexerService();
      
      await expect(service.indexMagnet('invalid')).rejects.toThrow(IndexerError);
    });

    it('should create torrent with correct data', async () => {
      mockFetchMetadata.mockResolvedValue(mockMetadata);
      mockGetTorrentByInfohash.mockResolvedValue(null);
      mockCreateTorrent.mockResolvedValue(createMockTorrent({
        infohash: mockMetadata.infohash,
        magnet_uri: mockMetadata.magnetUri,
        clean_title: null,
        name: mockMetadata.name,
        total_size: mockMetadata.totalSize,
        file_count: 2,
        piece_length: mockMetadata.pieceLength,
      }));
      mockCreateTorrentFiles.mockResolvedValue([]);

      const service = new IndexerService();
      await service.indexMagnet(mockMetadata.magnetUri);

      expect(mockCreateTorrent).toHaveBeenCalledWith({
        infohash: mockMetadata.infohash,
        magnet_uri: mockMetadata.magnetUri,
        name: mockMetadata.name,
        total_size: mockMetadata.totalSize,
        file_count: 2,
        piece_length: mockMetadata.pieceLength,
      });
    });

    it('should create files with correct data', async () => {
      mockFetchMetadata.mockResolvedValue(mockMetadata);
      mockGetTorrentByInfohash.mockResolvedValue(null);
      mockCreateTorrent.mockResolvedValue(createMockTorrent({
        infohash: mockMetadata.infohash,
        magnet_uri: mockMetadata.magnetUri,
        clean_title: null,
        name: mockMetadata.name,
        total_size: mockMetadata.totalSize,
        file_count: 2,
        piece_length: mockMetadata.pieceLength,
      }));
      mockCreateTorrentFiles.mockResolvedValue([]);

      const service = new IndexerService();
      await service.indexMagnet(mockMetadata.magnetUri);

      expect(mockCreateTorrentFiles).toHaveBeenCalledWith([
        {
          torrent_id: 'torrent-uuid-123',
          file_index: 0,
          path: 'Test Torrent/file1.mp3',
          name: 'file1.mp3',
          extension: 'mp3',
          size: 500000,
          piece_start: 0,
          piece_end: 30,
          media_category: 'audio',
          mime_type: 'audio/mpeg',
        },
        {
          torrent_id: 'torrent-uuid-123',
          file_index: 1,
          path: 'Test Torrent/file2.mp3',
          name: 'file2.mp3',
          extension: 'mp3',
          size: 500000,
          piece_start: 30,
          piece_end: 61,
          media_category: 'audio',
          mime_type: 'audio/mpeg',
        },
      ]);
    });
  });

  describe('IndexResult type', () => {
    it('should have correct structure', () => {
      const result: IndexResult = {
        torrentId: 'uuid-123',
        infohash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        fileCount: 10,
        totalSize: 1000000,
        isNew: true,
      };

      expect(result).toHaveProperty('torrentId');
      expect(result).toHaveProperty('infohash');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('fileCount');
      expect(result).toHaveProperty('totalSize');
      expect(result).toHaveProperty('isNew');
    });
  });

  describe('Edge cases', () => {
    it('should handle torrent with no files', async () => {
      const emptyMetadata: TorrentMetadata = {
        infohash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Empty Torrent',
        totalSize: 0,
        pieceLength: 16384,
        magnetUri: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12',
        seeders: null,
        leechers: null,
        files: [],
      };

      mockFetchMetadata.mockResolvedValue(emptyMetadata);
      mockGetTorrentByInfohash.mockResolvedValue(null);
      mockCreateTorrent.mockResolvedValue(createMockTorrent({
        infohash: emptyMetadata.infohash,
        magnet_uri: emptyMetadata.magnetUri,
        clean_title: null,
        name: emptyMetadata.name,
        total_size: 0,
        file_count: 0,
        piece_length: emptyMetadata.pieceLength,
      }));
      mockCreateTorrentFiles.mockResolvedValue([]);

      const service = new IndexerService();
      const result = await service.indexMagnet(emptyMetadata.magnetUri);

      expect(result.fileCount).toBe(0);
      expect(result.totalSize).toBe(0);
    });

    it('should handle files with null extension', async () => {
      const metadataWithNullExt: TorrentMetadata = {
        infohash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Test',
        totalSize: 1000,
        pieceLength: 16384,
        magnetUri: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12',
        seeders: null,
        leechers: null,
        files: [
          {
            index: 0,
            name: 'README',
            path: 'Test/README',
            size: 1000,
            offset: 0,
            pieceStart: 0,
            pieceEnd: 0,
            extension: null,
            mediaCategory: 'other',
            mimeType: null,
          },
        ],
      };

      mockFetchMetadata.mockResolvedValue(metadataWithNullExt);
      mockGetTorrentByInfohash.mockResolvedValue(null);
      mockCreateTorrent.mockResolvedValue(createMockTorrent({
        infohash: metadataWithNullExt.infohash,
        magnet_uri: metadataWithNullExt.magnetUri,
        clean_title: null,
        name: metadataWithNullExt.name,
        total_size: 1000,
        file_count: 1,
        piece_length: metadataWithNullExt.pieceLength,
      }));
      mockCreateTorrentFiles.mockResolvedValue([]);

      const service = new IndexerService();
      await service.indexMagnet(metadataWithNullExt.magnetUri);

      expect(mockCreateTorrentFiles).toHaveBeenCalledWith([
        expect.objectContaining({
          extension: null,
          mime_type: null,
        }),
      ]);
    });

    it('should handle database errors gracefully', async () => {
      mockFetchMetadata.mockResolvedValue({
        infohash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test',
        totalSize: 1000,
        pieceLength: 16384,
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        seeders: null,
        leechers: null,
        files: [],
      });
      mockGetTorrentByInfohash.mockResolvedValue(null);
      mockCreateTorrent.mockRejectedValue(new Error('Database connection failed'));

      const service = new IndexerService();
      
      await expect(
        service.indexMagnet('magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678')
      ).rejects.toThrow(IndexerError);
    });
  });
});
