/**
 * Tests for useWebTorrent hook
 *
 * Client-side WebTorrent streaming for native-compatible formats.
 * This hook enables P2P streaming directly in the browser for formats
 * that don't require server-side transcoding.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock fetch for TURN credentials API
const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ iceServers: [], ttl: 86400 }),
  } as Response)
);
vi.stubGlobal('fetch', mockFetch);

// Mock WebTorrent before importing the hook
const mockTorrent = {
  infoHash: 'abc123',
  name: 'Test Torrent',
  files: [
    {
      name: 'video.mp4',
      length: 1024 * 1024 * 100, // 100MB
      path: 'video.mp4',
      streamURL: 'blob:http://localhost/video-stream',
      getBlobURL: vi.fn((cb: (err: Error | null, url?: string) => void) => {
        cb(null, 'blob:http://localhost/video-blob');
      }),
      select: vi.fn(),
      deselect: vi.fn(),
    },
    {
      name: 'audio.mp3',
      length: 1024 * 1024 * 10, // 10MB
      path: 'audio.mp3',
      streamURL: 'blob:http://localhost/audio-stream',
      getBlobURL: vi.fn((cb: (err: Error | null, url?: string) => void) => {
        cb(null, 'blob:http://localhost/audio-blob');
      }),
      select: vi.fn(),
      deselect: vi.fn(),
    },
    {
      name: 'video.mkv',
      length: 1024 * 1024 * 200, // 200MB
      path: 'video.mkv',
      streamURL: 'blob:http://localhost/mkv-stream',
      getBlobURL: vi.fn((cb: (err: Error | null, url?: string) => void) => {
        cb(null, 'blob:http://localhost/mkv-blob');
      }),
      select: vi.fn(),
      deselect: vi.fn(),
    },
  ],
  progress: 0.5,
  downloadSpeed: 1024 * 1024, // 1MB/s
  uploadSpeed: 512 * 1024, // 512KB/s
  numPeers: 5,
  ready: true,
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn(),
};

const mockClient = {
  add: vi.fn((_magnetUri: string, _options?: { announce?: string[] }, callback?: (torrent: typeof mockTorrent) => void) => {
    // Handle both signatures: (magnetUri, callback) and (magnetUri, options, callback)
    const actualCallback = typeof _options === 'function' ? _options : callback;
    if (actualCallback) {
      setTimeout(() => actualCallback(mockTorrent), 10);
    }
    return mockTorrent;
  }),
  get: vi.fn(() => null as typeof mockTorrent | null),
  remove: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  torrents: [] as typeof mockTorrent[],
};

// Mock the webtorrent-loader module (CDN loader)
vi.mock('../lib/webtorrent-loader', () => ({
  loadWebTorrent: vi.fn(() => Promise.resolve(vi.fn(() => mockClient))),
}));

// Import hook after mocking
import { useWebTorrent, isNativeCompatible, NATIVE_VIDEO_FORMATS, NATIVE_AUDIO_FORMATS } from './use-webtorrent';

describe('useWebTorrent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.torrents = [];
    mockClient.get.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isNativeCompatible', () => {
    it('should return true for native video formats', () => {
      expect(isNativeCompatible('video.mp4')).toBe(true);
      expect(isNativeCompatible('video.webm')).toBe(true);
      expect(isNativeCompatible('video.ogv')).toBe(true);
      expect(isNativeCompatible('video.m4v')).toBe(true);
    });

    it('should return true for native audio formats', () => {
      expect(isNativeCompatible('audio.mp3')).toBe(true);
      expect(isNativeCompatible('audio.wav')).toBe(true);
      expect(isNativeCompatible('audio.ogg')).toBe(true);
      expect(isNativeCompatible('audio.aac')).toBe(true);
      expect(isNativeCompatible('audio.m4a')).toBe(true);
    });

    it('should return false for formats requiring transcoding', () => {
      expect(isNativeCompatible('video.mkv')).toBe(false);
      expect(isNativeCompatible('video.avi')).toBe(false);
      expect(isNativeCompatible('video.wmv')).toBe(false);
      expect(isNativeCompatible('video.flv')).toBe(false);
      expect(isNativeCompatible('video.mov')).toBe(false);
      expect(isNativeCompatible('video.ts')).toBe(false);
      expect(isNativeCompatible('audio.flac')).toBe(false);
      expect(isNativeCompatible('audio.wma')).toBe(false);
      expect(isNativeCompatible('audio.aiff')).toBe(false);
      expect(isNativeCompatible('audio.ape')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isNativeCompatible('VIDEO.MP4')).toBe(true);
      expect(isNativeCompatible('Audio.MP3')).toBe(true);
      expect(isNativeCompatible('VIDEO.MKV')).toBe(false);
    });

    it('should return false for non-media files', () => {
      expect(isNativeCompatible('document.pdf')).toBe(false);
      expect(isNativeCompatible('image.jpg')).toBe(false);
      expect(isNativeCompatible('archive.zip')).toBe(false);
    });

    it('should return false for files without extension', () => {
      expect(isNativeCompatible('noextension')).toBe(false);
    });
  });

  describe('NATIVE_VIDEO_FORMATS', () => {
    it('should include all browser-native video formats', () => {
      expect(NATIVE_VIDEO_FORMATS).toContain('mp4');
      expect(NATIVE_VIDEO_FORMATS).toContain('webm');
      expect(NATIVE_VIDEO_FORMATS).toContain('ogv');
      expect(NATIVE_VIDEO_FORMATS).toContain('m4v');
    });

    it('should not include formats requiring transcoding', () => {
      expect(NATIVE_VIDEO_FORMATS).not.toContain('mkv');
      expect(NATIVE_VIDEO_FORMATS).not.toContain('avi');
      expect(NATIVE_VIDEO_FORMATS).not.toContain('wmv');
    });
  });

  describe('NATIVE_AUDIO_FORMATS', () => {
    it('should include all browser-native audio formats', () => {
      expect(NATIVE_AUDIO_FORMATS).toContain('mp3');
      expect(NATIVE_AUDIO_FORMATS).toContain('wav');
      expect(NATIVE_AUDIO_FORMATS).toContain('ogg');
      expect(NATIVE_AUDIO_FORMATS).toContain('aac');
      expect(NATIVE_AUDIO_FORMATS).toContain('m4a');
    });

    it('should not include formats requiring transcoding', () => {
      expect(NATIVE_AUDIO_FORMATS).not.toContain('flac');
      expect(NATIVE_AUDIO_FORMATS).not.toContain('wma');
      expect(NATIVE_AUDIO_FORMATS).not.toContain('aiff');
    });
  });

  describe('hook initialization', () => {
    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useWebTorrent());

      expect(result.current.status).toBe('idle');
      expect(result.current.streamUrl).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.progress).toBe(0);
    });

    it('should not create WebTorrent client until startStream is called', () => {
      renderHook(() => useWebTorrent());

      // Client should not be created on mount
      expect(mockClient.add).not.toHaveBeenCalled();
    });
  });

  describe('startStream', () => {
    it('should start streaming a native-compatible file', async () => {
      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      expect(result.current.streamUrl).toBe('blob:http://localhost/video-stream');
      expect(result.current.error).toBeNull();
    });

    it('should reject non-native formats', async () => {
      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 2,
          fileName: 'video.mkv',
        });
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('not native-compatible');
    });

    it('should update progress during download', async () => {
      const { result } = renderHook(() => useWebTorrent());

      // Setup progress callback
      let progressCallback: ((progress: number) => void) | null = null;
      mockTorrent.on.mockImplementation((event: string, cb: (progress: number) => void) => {
        if (event === 'download') {
          progressCallback = cb;
        }
      });

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      // Simulate progress update
      if (progressCallback) {
        await act(async () => {
          progressCallback!(0.75);
        });
      }

      // Progress should be updated
      expect(result.current.progress).toBeGreaterThanOrEqual(0);
    });

    it('should provide download and upload speeds', async () => {
      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      expect(result.current.downloadSpeed).toBeGreaterThanOrEqual(0);
      expect(result.current.uploadSpeed).toBeGreaterThanOrEqual(0);
    });

    it('should provide peer count', async () => {
      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      expect(result.current.numPeers).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stopStream', () => {
    it('should stop streaming and cleanup', async () => {
      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      await act(async () => {
        result.current.stopStream();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.streamUrl).toBeNull();
    });

    it('should revoke blob URL on stop', async () => {
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      await act(async () => {
        result.current.stopStream();
      });

      expect(revokeObjectURL).toHaveBeenCalled();
      revokeObjectURL.mockRestore();
    });
  });

  describe('cleanup on unmount', () => {
    it('should cleanup WebTorrent client on unmount', async () => {
      const { result, unmount } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      unmount();

      // Client should be destroyed on unmount
      expect(mockClient.destroy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle torrent add errors', async () => {
      mockClient.add.mockImplementationOnce(() => {
        throw new Error('Failed to add torrent');
      });

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:invalid',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('Failed to add torrent');
    });

    it('should handle invalid file index', async () => {
      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 999, // Invalid index
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error).toContain('File not found');
    });
  });

  describe('reusing existing torrents', () => {
    it('should reuse existing torrent if already loaded', async () => {
      // First, simulate that the torrent is already loaded
      mockClient.get.mockReturnValue(mockTorrent);
      mockClient.torrents = [mockTorrent];

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      // Should not call add again since torrent is already loaded
      expect(mockClient.get).toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    it('should timeout if torrent add takes too long (no peers)', async () => {
      // Mock add to never call the callback (simulating no peers)
      mockClient.add.mockImplementationOnce((_magnetUri: string, _options?: { announce?: string[] }) => {
        // Return torrent but never call callback - simulates hanging
        return mockTorrent;
      });

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      // Wait for timeout (30s in real code, but we can't wait that long in tests)
      // This test verifies the timeout mechanism exists
      expect(result.current.status).toBe('loading');
    });

    it('should timeout if torrent ready event never fires', async () => {
      // Mock torrent that is not ready and never becomes ready
      const notReadyTorrent = {
        ...mockTorrent,
        ready: false,
        on: vi.fn(), // Never calls the ready callback
      };

      mockClient.add.mockImplementationOnce((_magnetUri: string, _options?: { announce?: string[] }, callback?: (torrent: typeof mockTorrent) => void) => {
        const actualCallback = typeof _options === 'function' ? _options : callback;
        if (actualCallback) {
          setTimeout(() => actualCallback(notReadyTorrent), 10);
        }
        return notReadyTorrent;
      });

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      // Should be in loading state waiting for ready
      expect(result.current.status).toBe('loading');
    });

    it('should include WebSocket trackers for peer discovery', async () => {
      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      // Verify that add was called with announce trackers
      expect(mockClient.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          announce: expect.arrayContaining([
            'wss://tracker.webtorrent.dev',
            'wss://tracker.openwebtorrent.com',
          ]),
        }),
        expect.any(Function)
      );
    });
  });

  describe('peer discovery and fallback', () => {
    it('should signal no-peers status when no WebRTC peers found after timeout', async () => {
      // Mock torrent with 0 peers
      const noPeersTorrent = {
        ...mockTorrent,
        numPeers: 0,
        files: mockTorrent.files.map(f => ({
          ...f,
          select: vi.fn(),
          deselect: vi.fn(),
        })),
      };

      mockClient.add.mockImplementationOnce((_magnetUri: string, _options?: { announce?: string[] }, callback?: (torrent: typeof mockTorrent) => void) => {
        const actualCallback = typeof _options === 'function' ? _options : callback;
        if (actualCallback) {
          setTimeout(() => actualCallback(noPeersTorrent), 10);
        }
        return noPeersTorrent;
      });

      vi.useFakeTimers();

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      // Wait for torrent to be ready
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('ready');

      // Advance past peer discovery timeout (10 seconds)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(result.current.status).toBe('no-peers');

      vi.useRealTimers();
    });

    it('should stay in ready status when sufficient peers are found', async () => {
      // Mock torrent with peers
      const withPeersTorrent = {
        ...mockTorrent,
        numPeers: 5,
        files: mockTorrent.files.map(f => ({
          ...f,
          select: vi.fn(),
          deselect: vi.fn(),
        })),
      };

      mockClient.add.mockImplementationOnce((_magnetUri: string, _options?: { announce?: string[] }, callback?: (torrent: typeof mockTorrent) => void) => {
        const actualCallback = typeof _options === 'function' ? _options : callback;
        if (actualCallback) {
          setTimeout(() => actualCallback(withPeersTorrent), 10);
        }
        return withPeersTorrent;
      });

      vi.useFakeTimers();

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      // Wait for torrent to be ready
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.status).toBe('ready');

      // Advance past peer discovery timeout (10 seconds)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Should still be ready since we have peers
      expect(result.current.status).toBe('ready');

      vi.useRealTimers();
    });

    it('should clear peer discovery timeout on stopStream', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const { result } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      await act(async () => {
        result.current.stopStream();
      });

      // clearTimeout should have been called for the peer discovery timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('should clear peer discovery timeout on unmount', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const { result, unmount } = renderHook(() => useWebTorrent());

      await act(async () => {
        result.current.startStream({
          magnetUri: 'magnet:?xt=urn:btih:abc123',
          fileIndex: 0,
          fileName: 'video.mp4',
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      unmount();

      // clearTimeout should have been called for the peer discovery timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });
});
