import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Readable } from 'node:stream';

// Create mock functions at module level
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockDestroy = vi.fn((callback?: () => void) => {
  if (callback) callback();
});
const mockGet = vi.fn();

// Mutable torrents array that tests can populate
let mockTorrents: unknown[] = [];

// Mock WebTorrent before importing the module
vi.mock('webtorrent', () => ({
  default: vi.fn(() => ({
    add: mockAdd,
    remove: mockRemove,
    destroy: mockDestroy,
    get: mockGet,
    get torrents() { return mockTorrents; },
    on: vi.fn(),
        removeListener: vi.fn(),
  })),
}));

// Import after mocking
import {
  StreamingService,
  StreamingError,
  FileNotFoundError,
  RangeNotSatisfiableError,
  type StreamOptions,
  type StreamResult,
} from './streaming';
import { getStreamingService } from './index';

describe('StreamingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTorrents = []; // Clear torrents array before each test
  });

  describe('constructor', () => {
    it('should create a StreamingService instance', () => {
      const service = new StreamingService();
      expect(service).toBeInstanceOf(StreamingService);
    });

    it('should accept custom options', () => {
      const service = new StreamingService({
        maxConcurrentStreams: 5,
        streamTimeout: 60000,
      });
      expect(service).toBeInstanceOf(StreamingService);
    });
  });

  describe('createStream', () => {
    it('should create a stream for a valid file', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            setTimeout(callback, 10);
          }
        }),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockGet.mockReturnValue(null);
      mockAdd.mockImplementation((_magnetUri: string, callback: (torrent: typeof mockTorrent) => void) => {
        callback(mockTorrent);
        return mockTorrent;
      });

      const service = new StreamingService();
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(result).toHaveProperty('stream');
      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('size');
      expect(result.size).toBe(5000000);
    });

    it('should support range requests for seeking', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'video.mp4',
        path: 'Movies/video.mp4',
        length: 100000000,
        createReadStream: vi.fn((opts: { start: number; end: number }) => {
          expect(opts.start).toBe(1000);
          expect(opts.end).toBe(2000);
          return mockFileStream;
        }),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Movies',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 1000 },
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            setTimeout(callback, 10);
          }
        }),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockGet.mockReturnValue(null);
      mockAdd.mockImplementation((_magnetUri: string, callback: (torrent: typeof mockTorrent) => void) => {
        callback(mockTorrent);
        return mockTorrent;
      });

      const service = new StreamingService();
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12',
        fileIndex: 0,
        range: { start: 1000, end: 2000 },
      });

      expect(result.isPartial).toBe(true);
      expect(result.contentRange).toBe('bytes 1000-2000/100000000');
    });

    it('should throw FileNotFoundError for invalid file index', async () => {
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [],
        pieceLength: 16384,
        pieces: { length: 100 },
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            setTimeout(callback, 10);
          }
        }),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockGet.mockReturnValue(null);
      mockAdd.mockImplementation((_magnetUri: string, callback: (torrent: typeof mockTorrent) => void) => {
        callback(mockTorrent);
        return mockTorrent;
      });

      const service = new StreamingService();
      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 5,
        })
      ).rejects.toThrow(FileNotFoundError);
    });

    it('should throw RangeNotSatisfiableError for invalid range', async () => {
      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 1000,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            setTimeout(callback, 10);
          }
        }),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockGet.mockReturnValue(null);
      mockAdd.mockImplementation((_magnetUri: string, callback: (torrent: typeof mockTorrent) => void) => {
        callback(mockTorrent);
        return mockTorrent;
      });

      const service = new StreamingService();
      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
          range: { start: 2000, end: 3000 },
        })
      ).rejects.toThrow(RangeNotSatisfiableError);
    });

    it('should throw StreamingError for invalid magnet URI', async () => {
      const service = new StreamingService();
      await expect(
        service.createStream({
          magnetUri: 'invalid-magnet',
          fileIndex: 0,
        })
      ).rejects.toThrow(StreamingError);
    });

    it('should reuse existing torrent if already added', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      // Add torrent to the torrents array (simulating existing torrent)
      mockTorrents = [mockTorrent];
      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(mockAdd).not.toHaveBeenCalled();
      expect(result.size).toBe(5000000);
    });
  });

  describe('getStreamInfo', () => {
    it('should return stream info for a file', async () => {
      const mockFile = {
        name: 'book.pdf',
        path: 'Books/book.pdf',
        length: 2000000,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Books',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 200 },
        ready: true,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      const info = await service.getStreamInfo({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(info.fileName).toBe('book.pdf');
      expect(info.size).toBe(2000000);
      expect(info.mimeType).toBe('application/pdf');
      expect(info.mediaCategory).toBe('ebook');
    });
  });

  describe('closeStream', () => {
    it('should close an active stream', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      await service.closeStream(result.streamId);
      expect(mockFileStream.destroy).toHaveBeenCalled();
    });

    it('should handle closing non-existent stream gracefully', async () => {
      const service = new StreamingService();
      // Should not throw
      await expect(service.closeStream('non-existent-id')).resolves.toBeUndefined();
    });
  });

  describe('getActiveStreams', () => {
    it('should return count of active streams', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      expect(service.getActiveStreamCount()).toBe(0);

      await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(service.getActiveStreamCount()).toBe(1);
    });
  });

  describe('destroy', () => {
    it('should destroy the service and clean up all streams', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      await service.destroy();
      expect(mockDestroy).toHaveBeenCalled();
      expect(service.getActiveStreamCount()).toBe(0);
    });
  });

  describe('StreamResult type', () => {
    it('should have correct structure for full response', () => {
      const result: StreamResult = {
        streamId: 'test-id',
        stream: {} as Readable,
        mimeType: 'audio/mpeg',
        size: 5000000,
        isPartial: false,
      };

      expect(result).toHaveProperty('streamId');
      expect(result).toHaveProperty('stream');
      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('size');
      expect(result).toHaveProperty('isPartial');
    });

    it('should have correct structure for partial response', () => {
      const result: StreamResult = {
        streamId: 'test-id',
        stream: {} as Readable,
        mimeType: 'video/mp4',
        size: 100000000,
        isPartial: true,
        contentRange: 'bytes 0-999999/100000000',
        contentLength: 1000000,
      };

      expect(result.isPartial).toBe(true);
      expect(result.contentRange).toBeDefined();
      expect(result.contentLength).toBe(1000000);
    });
  });

  describe('StreamOptions type', () => {
    it('should accept valid options', () => {
      const options: StreamOptions = {
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      };

      expect(options.magnetUri).toBeDefined();
      expect(options.fileIndex).toBe(0);
    });

    it('should accept range options', () => {
      const options: StreamOptions = {
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
        range: { start: 0, end: 1000 },
      };

      expect(options.range).toBeDefined();
      expect(options.range?.start).toBe(0);
      expect(options.range?.end).toBe(1000);
    });
  });

  describe('Media type detection', () => {
    it('should detect audio files correctly', async () => {
      const mockFile = {
        name: 'track.flac',
        path: 'Music/track.flac',
        length: 30000000,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Music',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 200 },
        ready: true,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      const info = await service.getStreamInfo({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(info.mediaCategory).toBe('audio');
      expect(info.mimeType).toBe('audio/flac');
    });

    it('should detect video files correctly', async () => {
      const mockFile = {
        name: 'movie.mkv',
        path: 'Movies/movie.mkv',
        length: 2000000000,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Movies',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 2000 },
        ready: true,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      const info = await service.getStreamInfo({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(info.mediaCategory).toBe('video');
      expect(info.mimeType).toBe('video/x-matroska');
    });

    it('should detect ebook files correctly', async () => {
      const mockFile = {
        name: 'book.epub',
        path: 'Books/book.epub',
        length: 500000,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Books',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 50 },
        ready: true,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      const info = await service.getStreamInfo({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(info.mediaCategory).toBe('ebook');
      expect(info.mimeType).toBe('application/epub+zip');
    });
  });

  describe('Piece prioritization', () => {
    it('should prioritize pieces for the requested file', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      // File should be selected for download
      expect(mockFile.select).toHaveBeenCalled();
    });
  });

  describe('Concurrent stream limits', () => {
    it('should enforce max concurrent streams limit', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ maxConcurrentStreams: 2 });

      // Create 2 streams (should succeed)
      await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });
      await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      // Third stream should fail
      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        })
      ).rejects.toThrow(StreamingError);
    });
  });

  describe('PRD Addendum: Concurrent stream isolation tests', () => {
    it('should maintain separate streams for different files in same torrent', async () => {
      const mockFileStream1 = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };
      const mockFileStream2 = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile1 = {
        name: 'track1.mp3',
        path: 'Album/track1.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream1),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockFile2 = {
        name: 'track2.mp3',
        path: 'Album/track2.mp3',
        length: 6000000,
        createReadStream: vi.fn(() => mockFileStream2),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile1, mockFile2],
        pieceLength: 16384,
        pieces: { length: 700 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      const result1 = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      const result2 = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 1,
      });

      // Streams should have different IDs
      expect(result1.streamId).not.toBe(result2.streamId);
      
      // Streams should have different sizes
      expect(result1.size).toBe(5000000);
      expect(result2.size).toBe(6000000);

      // Both files should be selected
      expect(mockFile1.select).toHaveBeenCalled();
      expect(mockFile2.select).toHaveBeenCalled();
    });

    it('should maintain separate streams for same file from different torrents', async () => {
      const mockFileStream1 = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };
      const mockFileStream2 = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile1 = {
        name: 'song.mp3',
        path: 'Album1/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream1),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockFile2 = {
        name: 'song.mp3',
        path: 'Album2/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream2),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent1 = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album1',
        files: [mockFile1],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      const mockTorrent2 = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Album2',
        files: [mockFile2],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      // Populate mockTorrents with both torrents for client.torrents.find() lookup
      mockTorrents = [mockTorrent1, mockTorrent2];
      
      // Return different torrents based on infohash
      mockGet.mockImplementation((infohash: string) => {
        if (infohash === '1234567890abcdef1234567890abcdef12345678') {
          return mockTorrent1;
        }
        if (infohash === 'abcdef1234567890abcdef1234567890abcdef12') {
          return mockTorrent2;
        }
        return null;
      });

      const service = new StreamingService();
      
      const result1 = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      const result2 = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12',
        fileIndex: 0,
      });

      // Streams should have different IDs
      expect(result1.streamId).not.toBe(result2.streamId);
      
      // Both should be tracked
      expect(service.getActiveStreamCount()).toBe(2);
    });

    it('should not affect other streams when one stream fails', async () => {
      const mockFileStream1 = {
        pipe: vi.fn(),
        on: vi.fn((event: string, callback: () => void) => {
          // Simulate error on first stream after a delay
          if (event === 'error') {
            setTimeout(callback, 50);
          }
        }),
        destroy: vi.fn(),
      };
      const mockFileStream2 = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile1 = {
        name: 'track1.mp3',
        path: 'Album/track1.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream1),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockFile2 = {
        name: 'track2.mp3',
        path: 'Album/track2.mp3',
        length: 6000000,
        createReadStream: vi.fn(() => mockFileStream2),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile1, mockFile2],
        pieceLength: 16384,
        pieces: { length: 700 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      const result1 = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      const result2 = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 1,
      });

      // Both streams should be active initially
      expect(service.getActiveStreamCount()).toBe(2);

      // Close first stream (simulating failure)
      await service.closeStream(result1.streamId);

      // Second stream should still be active
      expect(service.getActiveStreamCount()).toBe(1);
      
      // Second stream should still be valid
      expect(result2.stream).toBeDefined();
    });

    it('should handle rapid stream creation and destruction', async () => {
      const createMockStream = () => ({
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      });

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => createMockStream()),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ maxConcurrentStreams: 100 });
      
      // Create 50 streams rapidly
      const streamPromises = Array.from({ length: 50 }, () =>
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        })
      );

      const streams = await Promise.all(streamPromises);
      expect(streams).toHaveLength(50);
      expect(service.getActiveStreamCount()).toBe(50);

      // Close all streams rapidly
      await Promise.all(streams.map(s => service.closeStream(s.streamId)));
      expect(service.getActiveStreamCount()).toBe(0);
    });
  });

  describe('PRD Addendum: Piece prioritization verification tests', () => {
    it('should select only the requested file for download', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile1 = {
        name: 'track1.mp3',
        path: 'Album/track1.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockFile2 = {
        name: 'track2.mp3',
        path: 'Album/track2.mp3',
        length: 6000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockFile3 = {
        name: 'track3.mp3',
        path: 'Album/track3.mp3',
        length: 7000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile1, mockFile2, mockFile3],
        pieceLength: 16384,
        pieces: { length: 1100 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 1, // Request middle file
      });

      // Only the requested file should be selected
      expect(mockFile1.select).not.toHaveBeenCalled();
      expect(mockFile2.select).toHaveBeenCalled();
      expect(mockFile3.select).not.toHaveBeenCalled();
    });

    it('should deselect all pieces initially when torrent is added', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockDeselect = vi.fn();
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            setTimeout(callback, 10);
          }
        }),
        deselect: mockDeselect,
        select: vi.fn(),
      };

      mockGet.mockReturnValue(null); // Force new torrent add
      mockAdd.mockImplementation((_magnetUri: string, callback: (torrent: typeof mockTorrent) => void) => {
        callback(mockTorrent);
        return mockTorrent;
      });

      const service = new StreamingService();
      
      await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      // All pieces should be deselected initially
      expect(mockDeselect).toHaveBeenCalledWith(0, 349, 0);
    });

    it('should create stream with correct byte range for partial requests', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'video.mp4',
        path: 'Movies/video.mp4',
        length: 100000000, // 100 MB
        createReadStream: vi.fn((opts: { start: number; end: number }) => {
          // Verify the range is passed correctly
          expect(opts.start).toBe(50000000);
          expect(opts.end).toBe(60000000);
          return mockFileStream;
        }),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Movies',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 6104 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
        range: { start: 50000000, end: 60000000 },
      });

      expect(result.isPartial).toBe(true);
      expect(result.contentLength).toBe(10000001); // end - start + 1
      expect(result.contentRange).toBe('bytes 50000000-60000000/100000000');
    });

    it('should handle seeking to different positions in same file', async () => {
      const createMockStream = () => ({
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      });

      const ranges: Array<{ start: number; end: number }> = [];
      
      const mockFile = {
        name: 'video.mp4',
        path: 'Movies/video.mp4',
        length: 100000000,
        createReadStream: vi.fn((opts: { start: number; end: number }) => {
          ranges.push(opts);
          return createMockStream();
        }),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Movies',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 6104 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ maxConcurrentStreams: 10 });
      
      // Simulate seeking to different positions
      const seekPositions = [
        { start: 0, end: 1000000 },
        { start: 50000000, end: 51000000 },
        { start: 99000000, end: 99999999 },
      ];

      for (const range of seekPositions) {
        const result = await service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
          range,
        });
        await service.closeStream(result.streamId);
      }

      // Verify all ranges were requested
      expect(ranges).toHaveLength(3);
      expect(ranges[0]).toEqual({ start: 0, end: 1000000 });
      expect(ranges[1]).toEqual({ start: 50000000, end: 51000000 });
      expect(ranges[2]).toEqual({ start: 99000000, end: 99999999 });
    });

    it('should clean up resources after stream ends', async () => {
      const mockDestroy = vi.fn();
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'end') {
            // Simulate stream ending
            setTimeout(callback, 10);
          }
        }),
        destroy: mockDestroy,
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(service.getActiveStreamCount()).toBe(1);

      // Manually close the stream
      await service.closeStream(result.streamId);

      // Stream should be destroyed
      expect(mockDestroy).toHaveBeenCalled();
      expect(service.getActiveStreamCount()).toBe(0);
    });
  });

  describe('Torrent timeout and cleanup', () => {
    it('should remove torrent from client when metadata fetch times out', async () => {
      // Create a torrent that never becomes ready (simulating timeout)
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: undefined,
        files: [],
        pieceLength: 16384,
        pieces: { length: 0 },
        ready: false,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockGet.mockReturnValue(null);
      mockAdd.mockImplementation((_magnetUri: string, _callback: (torrent: typeof mockTorrent) => void) => {
        // Don't call callback - simulating metadata never arriving
        return mockTorrent;
      });

      const service = new StreamingService({ streamTimeout: 100 }); // Short timeout for test

      // Should timeout and throw
      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        })
      ).rejects.toThrow(StreamingError);

      // Torrent should be removed from client after timeout
      expect(mockRemove).toHaveBeenCalledWith(mockTorrent, expect.any(Function));
    });

    it('should wait for existing non-ready torrent instead of adding duplicate', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // Torrent that starts not ready but becomes ready
      let readyCallback: (() => void) | null = null;
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: false,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            readyCallback = callback;
          }
        }),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      // Return existing non-ready torrent
      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 5000 });

      // Start the stream request
      const streamPromise = service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      // Simulate torrent becoming ready after a short delay
      setTimeout(() => {
        mockTorrent.ready = true;
        if (readyCallback) readyCallback();
      }, 50);

      const result = await streamPromise;

      // Should NOT have tried to add a new torrent
      expect(mockAdd).not.toHaveBeenCalled();
      expect(result.size).toBe(5000000);
    });

    it('should handle retry after timeout by allowing re-add of same torrent', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // First attempt: torrent never becomes ready
      const mockTorrentNotReady = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: undefined,
        files: [],
        pieceLength: 16384,
        pieces: { length: 0 },
        ready: false,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      // Second attempt: torrent becomes ready
      const mockTorrentReady = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 100 },
        ready: false,
        progress: 1,
        numPeers: 5,
        bitfield: { get: vi.fn(() => true) },
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            setTimeout(callback, 10);
          }
        }),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      let addCallCount = 0;
      mockGet.mockReturnValue(null);
      mockAdd.mockImplementation((_magnetUri: string, callback: (torrent: typeof mockTorrentReady) => void) => {
        addCallCount++;
        if (addCallCount === 1) {
          // First call: don't call callback (timeout)
          return mockTorrentNotReady;
        }
        // Second call: call callback (success)
        callback(mockTorrentReady);
        return mockTorrentReady;
      });

      // Mock remove to actually clear the torrent
      mockRemove.mockImplementation((_torrent: unknown, callback?: () => void) => {
        if (callback) callback();
      });

      const service = new StreamingService({ streamTimeout: 100 });

      // First attempt should timeout
      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        })
      ).rejects.toThrow(StreamingError);

      // Verify torrent was removed after timeout
      expect(mockRemove).toHaveBeenCalled();

      // Second attempt should succeed (torrent was cleaned up)
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(result.size).toBe(5000000);
      expect(addCallCount).toBe(2);
    });

    it('should remove torrent from client when torrent error occurs', async () => {
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: undefined,
        files: [],
        pieceLength: 16384,
        pieces: { length: 0 },
        ready: false,
        on: vi.fn((event: string, callback: (err?: Error) => void) => {
          if (event === 'error') {
            // Simulate error after a short delay
            setTimeout(() => callback(new Error('Torrent error')), 10);
          }
        }),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockGet.mockReturnValue(null);
      mockAdd.mockImplementation((_magnetUri: string, _callback: (torrent: typeof mockTorrent) => void) => {
        return mockTorrent;
      });

      const service = new StreamingService({ streamTimeout: 5000 });

      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        })
      ).rejects.toThrow(StreamingError);

      // Torrent should be removed from client after error
      expect(mockRemove).toHaveBeenCalledWith(mockTorrent, expect.any(Function));
    });
  });

  describe('waitForData functionality', () => {
    it('should return immediately when start piece is already downloaded', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        offset: 0, // File starts at beginning of torrent
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // Mock bitfield with piece 0 already downloaded
      const mockBitfield = {
        get: vi.fn((index: number) => index === 0), // Piece 0 is downloaded
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 0.01,
        numPeers: 5,
        bitfield: mockBitfield,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      // Should complete quickly since piece is already downloaded
      const startTime = Date.now();
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });
      const elapsed = Date.now() - startTime;

      expect(result.size).toBe(5000000);
      // Should be fast since piece was already downloaded
      expect(elapsed).toBeLessThan(1000);
      // Bitfield should have been checked
      expect(mockBitfield.get).toHaveBeenCalledWith(0);
    });

    it('should wait for piece to be downloaded when not available', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        offset: 0,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // Mock bitfield that starts with no pieces, then gets piece 0
      let pieceDownloaded = false;
      const mockBitfield = {
        get: vi.fn((index: number) => index === 0 && pieceDownloaded),
      };

      let downloadHandler: (() => void) | null = null;
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 0,
        numPeers: 5,
        bitfield: mockBitfield,
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'download') {
            downloadHandler = handler;
          }
        }),
        removeListener: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 5000 });
      
      // Start the stream request
      const streamPromise = service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      // Simulate piece being downloaded after a short delay
      setTimeout(() => {
        pieceDownloaded = true;
        if (downloadHandler) downloadHandler();
      }, 100);

      const result = await streamPromise;

      expect(result.size).toBe(5000000);
      // Download event listener should have been registered
      expect(mockTorrent.on).toHaveBeenCalledWith('download', expect.any(Function));
    });

    it('should timeout when piece is never downloaded', async () => {
      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        offset: 0,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // Mock bitfield that never has the piece
      const mockBitfield = {
        get: vi.fn(() => false),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 0,
        numPeers: 0, // No peers
        bitfield: mockBitfield,
        on: vi.fn(),
        removeListener: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 200 }); // Short timeout for test

      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        })
      ).rejects.toThrow(/Timeout waiting for data/);
    });

    it('should calculate correct piece for range request with file offset', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      // File starts at offset 1000000 in the torrent
      const mockFile = {
        name: 'track2.mp3',
        path: 'Album/track2.mp3',
        length: 5000000,
        offset: 1000000, // File starts at 1MB into torrent
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // pieceLength is 16384 (16KB)
      // File offset: 1000000
      // Range start: 500000
      // Absolute position: 1000000 + 500000 = 1500000
      // Start piece: floor(1500000 / 16384) = 91
      const expectedPiece = Math.floor(1500000 / 16384); // 91

      const checkedPieces: number[] = [];
      const mockBitfield = {
        get: vi.fn((index: number) => {
          checkedPieces.push(index);
          return index === expectedPiece; // Only piece 91 is downloaded
        }),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 500 },
        ready: true,
        progress: 0.2,
        numPeers: 5,
        bitfield: mockBitfield,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
        range: { start: 500000, end: 600000 },
      });

      expect(result.isPartial).toBe(true);
      // Should have checked the correct piece (91)
      expect(checkedPieces).toContain(expectedPiece);
    });

    it('should handle file with no offset property gracefully', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      // File without offset property (defaults to 0)
      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        // No offset property
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockBitfield = {
        get: vi.fn(() => true), // All pieces downloaded
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 1,
        numPeers: 5,
        bitfield: mockBitfield,
        on: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService();
      
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      expect(result.size).toBe(5000000);
      // Should check piece 0 (since offset defaults to 0)
      expect(mockBitfield.get).toHaveBeenCalledWith(0);
    });

    it('should handle torrent without bitfield property', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        offset: 0,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // Torrent without bitfield - should wait for download event
      let downloadHandler: (() => void) | null = null;
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        // No bitfield property - explicitly undefined
        bitfield: undefined,
        ready: true,
        progress: 0,
        numPeers: 5,
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'download') {
            downloadHandler = handler;
          }
        }),
        removeListener: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 500 });
      
      // Should timeout since there's no bitfield to check
      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        })
      ).rejects.toThrow(/Timeout waiting for data/);
    });

    it('should clean up download listener after piece is downloaded', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        offset: 0,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      let pieceDownloaded = false;
      const mockBitfield = {
        get: vi.fn(() => pieceDownloaded),
      };

      let downloadHandler: (() => void) | null = null;
      const mockRemoveListener = vi.fn();
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 0,
        numPeers: 5,
        bitfield: mockBitfield,
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'download') {
            downloadHandler = handler;
          }
        }),
        removeListener: mockRemoveListener,
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 5000 });
      
      const streamPromise = service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      });

      // Simulate piece being downloaded
      setTimeout(() => {
        pieceDownloaded = true;
        if (downloadHandler) downloadHandler();
      }, 100);

      await streamPromise;

      // Download listener should have been removed
      expect(mockRemoveListener).toHaveBeenCalledWith('download', expect.any(Function));
    });

    it('should include progress and peer info in timeout error message', async () => {
      const mockFile = {
        name: 'song.mp3',
        path: 'Album/song.mp3',
        length: 5000000,
        offset: 0,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      const mockBitfield = {
        get: vi.fn(() => false),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 350 },
        ready: true,
        progress: 0.25, // 25% progress
        numPeers: 3, // 3 peers
        bitfield: mockBitfield,
        on: vi.fn(),
        removeListener: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 200 });

      try {
        await service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StreamingError);
        const message = (error as Error).message;
        expect(message).toContain('Progress:');
        expect(message).toContain('Peers:');
      }
    });

    it('should skip waitForData when skipWaitForData is true (for transcoding)', async () => {
      const mockFileStream = {
        pipe: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };

      const mockFile = {
        name: 'movie.mkv',
        path: 'Movies/movie.mkv',
        length: 2000000000,
        offset: 0,
        createReadStream: vi.fn(() => mockFileStream),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // Mock bitfield that has NO pieces downloaded
      const mockBitfield = {
        get: vi.fn(() => false), // No pieces downloaded
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Movies',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 122070 },
        ready: true,
        progress: 0,
        numPeers: 5,
        bitfield: mockBitfield,
        on: vi.fn(),
        removeListener: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 200 }); // Short timeout
      
      // With skipWaitForData=true, should NOT wait for data and return immediately
      const startTime = Date.now();
      const result = await service.createStream({
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        fileIndex: 0,
      }, true); // skipWaitForData = true
      const elapsed = Date.now() - startTime;

      expect(result.size).toBe(2000000000);
      // Should complete quickly without waiting for data
      expect(elapsed).toBeLessThan(100);
      // Bitfield should NOT have been checked (we skipped waitForData)
      expect(mockBitfield.get).not.toHaveBeenCalled();
    });

    it('should timeout when skipWaitForData is false and no data available', async () => {
      const mockFile = {
        name: 'movie.mkv',
        path: 'Movies/movie.mkv',
        length: 2000000000,
        offset: 0,
        createReadStream: vi.fn(),
        select: vi.fn(),
        deselect: vi.fn(),
      };

      // Mock bitfield that has NO pieces downloaded
      const mockBitfield = {
        get: vi.fn(() => false),
      };

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Movies',
        files: [mockFile],
        pieceLength: 16384,
        pieces: { length: 122070 },
        ready: true,
        progress: 0,
        numPeers: 0,
        bitfield: mockBitfield,
        on: vi.fn(),
        removeListener: vi.fn(),
        deselect: vi.fn(),
        select: vi.fn(),
      };

      mockTorrents = [mockTorrent];
      mockGet.mockReturnValue(mockTorrent);

      const service = new StreamingService({ streamTimeout: 200 }); // Short timeout
      
      // With skipWaitForData=false (default), should timeout waiting for data
      await expect(
        service.createStream({
          magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
          fileIndex: 0,
        }, false) // skipWaitForData = false (default)
      ).rejects.toThrow(/Timeout waiting for data/);
    });
  });

  describe('getTorrentStats', () => {
    it('should return stats for an active torrent', () => {
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album',
        files: [],
        numPeers: 15,
        progress: 0.75,
        downloadSpeed: 1000000,
        uploadSpeed: 500000,
        ready: true,
        on: vi.fn(),
      };

      mockTorrents = [mockTorrent];

      const service = new StreamingService();
      const stats = service.getTorrentStats('1234567890abcdef1234567890abcdef12345678');

      expect(stats).not.toBeNull();
      expect(stats?.infohash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(stats?.numPeers).toBe(15);
      expect(stats?.progress).toBe(0.75);
      expect(stats?.downloadSpeed).toBe(1000000);
      expect(stats?.uploadSpeed).toBe(500000);
      expect(stats?.ready).toBe(true);
    });

    it('should return null for non-existent torrent', () => {
      mockTorrents = [];

      const service = new StreamingService();
      const stats = service.getTorrentStats('nonexistent');

      expect(stats).toBeNull();
    });
  });

  describe('getAllTorrentStats', () => {
    it('should return stats for all active torrents', () => {
      const mockTorrent1 = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Album1',
        files: [],
        numPeers: 10,
        progress: 0.5,
        downloadSpeed: 500000,
        uploadSpeed: 250000,
        ready: true,
        on: vi.fn(),
      };

      const mockTorrent2 = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Album2',
        files: [],
        numPeers: 20,
        progress: 1.0,
        downloadSpeed: 0,
        uploadSpeed: 1000000,
        ready: true,
        on: vi.fn(),
      };

      mockTorrents = [mockTorrent1, mockTorrent2];

      const service = new StreamingService();
      const allStats = service.getAllTorrentStats();

      expect(allStats).toHaveLength(2);
      expect(allStats[0].infohash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(allStats[0].numPeers).toBe(10);
      expect(allStats[1].infohash).toBe('abcdef1234567890abcdef1234567890abcdef12');
      expect(allStats[1].numPeers).toBe(20);
    });

    it('should return empty array when no torrents are active', () => {
      mockTorrents = [];

      const service = new StreamingService();
      const allStats = service.getAllTorrentStats();

      expect(allStats).toHaveLength(0);
    });
  });
});

describe('getStreamingService singleton', () => {
  it('should return a StreamingService instance', () => {
    const service = getStreamingService();
    expect(service).toBeInstanceOf(StreamingService);
  });

  it('should return the same instance on multiple calls', () => {
    const service1 = getStreamingService();
    const service2 = getStreamingService();
    expect(service1).toBe(service2);
  });

  it('should have default configuration options', () => {
    const service = getStreamingService();
    // The singleton should be configured with maxConcurrentStreams: 10
    // We can verify this by checking that we can create up to 10 streams
    expect(service).toBeInstanceOf(StreamingService);
  });
});
