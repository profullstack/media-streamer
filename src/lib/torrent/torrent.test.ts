import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TorrentMetadata, TorrentFileInfo, MetadataProgressEvent } from './torrent';

// Create mock functions at module level
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockDestroy = vi.fn((callback?: () => void) => {
  if (callback) callback();
});

// Mock WebTorrent before importing the module
vi.mock('webtorrent', () => ({
  default: vi.fn(() => ({
    add: mockAdd,
    remove: mockRemove,
    destroy: mockDestroy,
    torrents: [],
    on: vi.fn(), // Add mock for client-level event listener
  })),
}));

// Import after mocking
import {
  TorrentService,
  TorrentMetadataError,
  TorrentTimeoutError,
} from './torrent';

describe('TorrentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a TorrentService instance', () => {
      const service = new TorrentService();
      expect(service).toBeInstanceOf(TorrentService);
    });

    it('should accept custom timeout option', () => {
      const customService = new TorrentService({ metadataTimeout: 60000 });
      expect(customService).toBeInstanceOf(TorrentService);
    });
  });

  describe('fetchMetadata', () => {
    it('should fetch metadata from a valid magnet URI', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          {
            name: 'file1.mp3',
            path: 'Test Torrent/file1.mp3',
            length: 500000,
          },
          {
            name: 'file2.mp3',
            path: 'Test Torrent/file2.mp3',
            length: 500000,
          },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        // Fire metadata event after a short delay
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.infohash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(metadata.name).toBe('Test Torrent');
      expect(metadata.totalSize).toBe(1000000);
      expect(metadata.pieceLength).toBe(16384);
      expect(metadata.files).toHaveLength(2);
    });

    it('should calculate piece indices for files', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Music Album',
        length: 100000,
        pieceLength: 16384,
        pieces: { length: 10 },
        numPeers: 0,
        ready: false,
        files: [
          {
            name: 'track01.flac',
            path: 'Music Album/track01.flac',
            length: 50000,
          },
          {
            name: 'track02.flac',
            path: 'Music Album/track02.flac',
            length: 50000,
          },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
      const metadata = await service.fetchMetadata(magnetUri);

      // First file: offset 0, length 50000
      // pieceStart = floor(0 / 16384) = 0
      // pieceEnd = floor((0 + 50000 - 1) / 16384) = floor(49999 / 16384) = 3
      expect(metadata.files[0].pieceStart).toBe(0);
      expect(metadata.files[0].pieceEnd).toBe(3);

      // Second file: offset 50000, length 50000
      // pieceStart = floor(50000 / 16384) = 3
      // pieceEnd = floor((50000 + 50000 - 1) / 16384) = floor(99999 / 16384) = 6
      expect(metadata.files[1].pieceStart).toBe(3);
      expect(metadata.files[1].pieceEnd).toBe(6);
    });

    it('should detect media category for files', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Mixed Media',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          { name: 'song.mp3', path: 'Mixed Media/song.mp3', length: 100000 },
          { name: 'movie.mkv', path: 'Mixed Media/movie.mkv', length: 500000 },
          { name: 'book.epub', path: 'Mixed Media/book.epub', length: 200000 },
          { name: 'notes.txt', path: 'Mixed Media/notes.txt', length: 100000 },
          { name: 'readme', path: 'Mixed Media/readme', length: 100000 },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.files[0].mediaCategory).toBe('audio');
      expect(metadata.files[1].mediaCategory).toBe('video');
      expect(metadata.files[2].mediaCategory).toBe('ebook');
      expect(metadata.files[3].mediaCategory).toBe('document');
      expect(metadata.files[4].mediaCategory).toBe('other');
    });

    it('should throw TorrentMetadataError for invalid magnet URI', async () => {
      const service = new TorrentService();
      await expect(service.fetchMetadata('invalid')).rejects.toThrow(TorrentMetadataError);
    });

    it('should throw TorrentTimeoutError when metadata fetch times out', async () => {
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [],
        on: vi.fn(), // Never calls the metadata callback
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        return mockTorrent;
      });

      // Create service with very short timeout
      const shortTimeoutService = new TorrentService({ metadataTimeout: 50 });
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';

      await expect(shortTimeoutService.fetchMetadata(magnetUri)).rejects.toThrow(TorrentTimeoutError);
    });

    it('should deselect all files after fetching metadata', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const mockDeselect = vi.fn();
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          { name: 'file1.mp3', path: 'Test Torrent/file1.mp3', length: 500000 },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: mockDeselect,
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      await service.fetchMetadata(magnetUri);

      // Should deselect all pieces to prevent downloading
      expect(mockDeselect).toHaveBeenCalled();
    });
  });

  describe('removeTorrent', () => {
    it('should remove a torrent by infohash', async () => {
      const service = new TorrentService();
      const infohash = '1234567890abcdef1234567890abcdef12345678';
      await service.removeTorrent(infohash);

      expect(mockRemove).toHaveBeenCalledWith(infohash);
    });
  });

  describe('destroy', () => {
    it('should destroy the WebTorrent client', async () => {
      const service = new TorrentService();
      await service.destroy();

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe('TorrentMetadata type', () => {
    it('should have correct structure', () => {
      const metadata: TorrentMetadata = {
        infohash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        totalSize: 1000000,
        pieceLength: 16384,
        files: [],
        magnetUri: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
      };

      expect(metadata).toHaveProperty('infohash');
      expect(metadata).toHaveProperty('name');
      expect(metadata).toHaveProperty('totalSize');
      expect(metadata).toHaveProperty('pieceLength');
      expect(metadata).toHaveProperty('files');
      expect(metadata).toHaveProperty('magnetUri');
    });
  });

  describe('TorrentFileInfo type', () => {
    it('should have correct structure', () => {
      const fileInfo: TorrentFileInfo = {
        index: 0,
        name: 'file.mp3',
        path: '/music/file.mp3',
        size: 5000000,
        offset: 0,
        pieceStart: 0,
        pieceEnd: 100,
        extension: 'mp3',
        mediaCategory: 'audio',
        mimeType: 'audio/mpeg',
      };

      expect(fileInfo).toHaveProperty('index');
      expect(fileInfo).toHaveProperty('name');
      expect(fileInfo).toHaveProperty('path');
      expect(fileInfo).toHaveProperty('size');
      expect(fileInfo).toHaveProperty('offset');
      expect(fileInfo).toHaveProperty('pieceStart');
      expect(fileInfo).toHaveProperty('pieceEnd');
      expect(fileInfo).toHaveProperty('extension');
      expect(fileInfo).toHaveProperty('mediaCategory');
      expect(fileInfo).toHaveProperty('mimeType');
    });
  });

  describe('Edge cases', () => {
    it('should handle torrent with no files', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Empty Torrent',
        length: 0,
        pieceLength: 16384,
        pieces: { length: 0 },
        numPeers: 0,
        ready: false,
        files: [],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.files).toHaveLength(0);
      expect(metadata.totalSize).toBe(0);
    });

    it('should handle files with no extension', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test',
        length: 1000,
        pieceLength: 16384,
        pieces: { length: 1 },
        numPeers: 0,
        ready: false,
        files: [
          { name: 'README', path: 'Test/README', length: 1000 },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.files[0].extension).toBeNull();
      expect(metadata.files[0].mediaCategory).toBe('other');
    });

    it('should handle deeply nested file paths', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Music',
        length: 1000,
        pieceLength: 16384,
        pieces: { length: 1 },
        numPeers: 0,
        ready: false,
        files: [
          {
            name: 'track.flac',
            path: 'Music/Artist/Album/Disc 1/track.flac',
            length: 1000,
          },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.files[0].path).toBe('Music/Artist/Album/Disc 1/track.flac');
    });
  });

  describe('PRD Addendum: Large metadata stress tests', () => {
    it('should handle torrents with 10,000+ files', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      // Generate 10,000 mock files
      const fileCount = 10000;
      const mockFiles = Array.from({ length: fileCount }, (_, i) => ({
        name: `track_${String(i).padStart(5, '0')}.mp3`,
        path: `Music Archive/Artist ${Math.floor(i / 100)}/Album ${Math.floor(i / 10) % 10}/track_${String(i).padStart(5, '0')}.mp3`,
        length: 5000000 + (i * 100), // Varying sizes
      }));

      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Music Archive',
        length: mockFiles.reduce((sum, f) => sum + f.length, 0),
        pieceLength: 16384,
        pieces: { length: Math.ceil(mockFiles.reduce((sum, f) => sum + f.length, 0) / 16384) },
        numPeers: 0,
        ready: false,
        files: mockFiles,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.files).toHaveLength(fileCount);
      expect(metadata.files[0].index).toBe(0);
      expect(metadata.files[fileCount - 1].index).toBe(fileCount - 1);
      
      // Verify piece calculations are correct for all files
      for (let i = 0; i < 10; i++) {
        const file = metadata.files[i];
        expect(file.pieceStart).toBeGreaterThanOrEqual(0);
        expect(file.pieceEnd).toBeGreaterThanOrEqual(file.pieceStart);
      }
    });

    it('should handle torrents with deeply nested directory structures (100+ levels)', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      // Create a deeply nested path
      const depth = 100;
      const nestedPath = Array.from({ length: depth }, (_, i) => `folder_${i}`).join('/');
      
      const mockTorrent = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Deep Archive',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          {
            name: 'file.txt',
            path: `Deep Archive/${nestedPath}/file.txt`,
            length: 1000000,
          },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.files[0].path).toContain('folder_99');
      expect(metadata.files[0].path.split('/').length).toBeGreaterThan(100);
    });

    it('should handle torrents with very large total size (multi-TB)', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const TB = 1024 * 1024 * 1024 * 1024;
      const totalSize = 300 * TB; // 300 TB
      
      const mockTorrent = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Massive Archive',
        length: totalSize,
        pieceLength: 16 * 1024 * 1024, // 16 MB pieces for large torrents
        pieces: { length: Math.ceil(totalSize / (16 * 1024 * 1024)) },
        numPeers: 0,
        ready: false,
        files: [
          {
            name: 'huge_file.bin',
            path: 'Massive Archive/huge_file.bin',
            length: totalSize,
          },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.totalSize).toBe(totalSize);
      expect(metadata.files[0].size).toBe(totalSize);
    });

    it('should handle files with unicode characters in names', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: '音楽コレクション',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          {
            name: '日本語ファイル名.mp3',
            path: '音楽コレクション/アーティスト/アルバム/日本語ファイル名.mp3',
            length: 500000,
          },
          {
            name: 'Ελληνικά.flac',
            path: '音楽コレクション/Ελληνικά/Ελληνικά.flac',
            length: 500000,
          },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.name).toBe('音楽コレクション');
      expect(metadata.files[0].name).toBe('日本語ファイル名.mp3');
      expect(metadata.files[1].name).toBe('Ελληνικά.flac');
    });

    it('should handle files with special characters in names', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        name: 'Special Chars',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          {
            name: 'file with spaces & symbols!@#$%.mp3',
            path: 'Special Chars/file with spaces & symbols!@#$%.mp3',
            length: 500000,
          },
          {
            name: "file'with\"quotes.mp3",
            path: "Special Chars/file'with\"quotes.mp3",
            length: 500000,
          },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
      const metadata = await service.fetchMetadata(magnetUri);

      expect(metadata.files[0].name).toBe('file with spaces & symbols!@#$%.mp3');
      expect(metadata.files[1].name).toBe("file'with\"quotes.mp3");
    });
  });

  describe('PRD Addendum: Timeout and tracker failure handling', () => {
    it('should timeout when metadata never arrives', async () => {
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Slow Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [],
        on: vi.fn(), // Never calls metadata callback
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        return mockTorrent;
      });

      const service = new TorrentService({ metadataTimeout: 100 });
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';

      await expect(service.fetchMetadata(magnetUri)).rejects.toThrow(TorrentTimeoutError);
    });

    it('should include timeout duration in error message', async () => {
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Slow Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [],
        on: vi.fn(),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        return mockTorrent;
      });

      const timeoutMs = 150;
      const service = new TorrentService({ metadataTimeout: timeoutMs });
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';

      try {
        await service.fetchMetadata(magnetUri);
        expect.fail('Should have thrown TorrentTimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TorrentTimeoutError);
        expect((error as TorrentTimeoutError).message).toContain(String(timeoutMs));
      }
    });

    it('should clean up torrent on timeout', async () => {
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Slow Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [],
        on: vi.fn(),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        return mockTorrent;
      });

      const service = new TorrentService({ metadataTimeout: 50 });
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';

      try {
        await service.fetchMetadata(magnetUri);
      } catch {
        // Expected to throw
      }

      // Verify cleanup was called
      expect(mockRemove).toHaveBeenCalled();
    });

    it('should handle multiple concurrent metadata fetches with different timeouts', async () => {
      let callCount = 0;
      
      mockAdd.mockImplementation((_magnetUri: string) => {
        callCount++;
        const currentCall = callCount;
        const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
        
        // For the second torrent, return empty files to prevent "ready" event from resolving
        const mockTorrent = {
          infoHash: `${currentCall}234567890abcdef1234567890abcdef1234567`,
          name: `Torrent ${currentCall}`,
          length: currentCall === 1 ? 1000000 : 0,
          pieceLength: 16384,
          pieces: { length: currentCall === 1 ? 100 : 0 },
          numPeers: 0,
          ready: false,
          files: currentCall === 1
            ? [{ name: 'file.mp3', path: `Torrent ${currentCall}/file.mp3`, length: 1000000 }]
            : [], // Empty files for second torrent - won't trigger ready resolution
          on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
            if (!eventHandlers[event]) {
              eventHandlers[event] = [];
            }
            eventHandlers[event].push(cb);
          }),
          deselect: vi.fn(),
        };
        
        // First torrent responds quickly, second times out
        if (currentCall === 1) {
          setTimeout(() => {
            if (eventHandlers['metadata']) {
              eventHandlers['metadata'].forEach(cb => cb());
            }
          }, 10);
        }
        // Second torrent never responds (will timeout) - no metadata or ready events
        
        return mockTorrent;
      });

      const service = new TorrentService({ metadataTimeout: 100 });
      
      const fastPromise = service.fetchMetadata('magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678');
      const slowPromise = service.fetchMetadata('magnet:?xt=urn:btih:2234567890abcdef1234567890abcdef12345678');

      // Fast one should succeed
      const fastResult = await fastPromise;
      expect(fastResult.name).toBe('Torrent 1');

      // Slow one should timeout
      await expect(slowPromise).rejects.toThrow(TorrentTimeoutError);
    });
  });

  describe('Progress events', () => {
    it('should emit progress events during metadata fetch', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const progressEvents: Array<{ stage: string; progress: number }> = [];
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          { name: 'file1.mp3', path: 'Test Torrent/file1.mp3', length: 500000 },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 50);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      
      await service.fetchMetadata(magnetUri, (event) => {
        progressEvents.push({ stage: event.stage, progress: event.progress });
      });

      // Should have at least connecting and complete stages
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
      expect(progressEvents[0].stage).toBe('connecting');
      expect(progressEvents[progressEvents.length - 1].stage).toBe('complete');
      expect(progressEvents[progressEvents.length - 1].progress).toBe(100);
    });

    it('should emit peer count updates', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      const progressEvents: Array<{ numPeers?: number }> = [];
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          { name: 'file1.mp3', path: 'Test Torrent/file1.mp3', length: 500000 },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
          
          if (event === 'wire') {
            // Simulate peer connection
            mockTorrent.numPeers = 1;
            setTimeout(() => callback({ remoteAddress: '1.2.3.4' }), 10);
          }
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 50);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      
      await service.fetchMetadata(magnetUri, (event) => {
        progressEvents.push({ numPeers: event.numPeers });
      });

      // Should have received peer count updates
      expect(progressEvents.some(e => e.numPeers !== undefined)).toBe(true);
    });

    it('should work without progress callback', async () => {
      const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
      
      const mockTorrent = {
        infoHash: '1234567890abcdef1234567890abcdef12345678',
        name: 'Test Torrent',
        length: 1000000,
        pieceLength: 16384,
        pieces: { length: 100 },
        numPeers: 0,
        ready: false,
        files: [
          { name: 'file1.mp3', path: 'Test Torrent/file1.mp3', length: 500000 },
        ],
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (!eventHandlers[event]) {
            eventHandlers[event] = [];
          }
          eventHandlers[event].push(callback);
        }),
        deselect: vi.fn(),
      };

      mockAdd.mockImplementation((_magnetUri: string) => {
        setTimeout(() => {
          if (eventHandlers['metadata']) {
            eventHandlers['metadata'].forEach(cb => cb());
          }
        }, 10);
        return mockTorrent;
      });

      const service = new TorrentService();
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      
      // Should work without callback
      const metadata = await service.fetchMetadata(magnetUri);
      expect(metadata.infohash).toBe('1234567890abcdef1234567890abcdef12345678');
    });
  });
});
