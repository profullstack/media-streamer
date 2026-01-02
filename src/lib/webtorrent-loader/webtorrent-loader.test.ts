/**
 * Tests for WebTorrent Browser Loader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original globals
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

// Mock script element
const createMockScript = () => ({
  src: '',
  async: false,
  onload: null as (() => void) | null,
  onerror: null as ((event: unknown) => void) | null,
  remove: vi.fn(),
});

describe('webtorrent-loader', () => {
  let mockScript: ReturnType<typeof createMockScript>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockScript = createMockScript();

    // Setup browser environment mocks using Object.defineProperty to avoid TS errors
    Object.defineProperty(globalThis, 'window', {
      value: {},
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: vi.fn(() => mockScript),
        head: {
          appendChild: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original globals
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      writable: true,
      configurable: true,
    });
  });

  describe('loadWebTorrent', () => {
    it('should be a function', async () => {
      const { loadWebTorrent } = await import('./webtorrent-loader');
      expect(typeof loadWebTorrent).toBe('function');
    });

    it('should return a promise', async () => {
      const { loadWebTorrent } = await import('./webtorrent-loader');
      const result = loadWebTorrent();
      expect(result).toBeInstanceOf(Promise);
      // Clean up - catch the rejection since we can't actually load from CDN in tests
      result.catch(() => {});
    });

    it('should create a script element and append to head', async () => {
      const { loadWebTorrent } = await import('./webtorrent-loader');
      loadWebTorrent().catch(() => {});

      expect(globalThis.document.createElement).toHaveBeenCalledWith('script');
      expect(globalThis.document.head.appendChild).toHaveBeenCalledWith(mockScript);
      expect(mockScript.src).toContain('webtorrent');
      expect(mockScript.async).toBe(true);
    });

    it('should resolve when script loads and WebTorrent is available', async () => {
      const mockWebTorrent = vi.fn();
      (globalThis.window as unknown as Record<string, unknown>).WebTorrent = mockWebTorrent;

      const { loadWebTorrent } = await import('./webtorrent-loader');
      const promise = loadWebTorrent();

      // Simulate script load
      if (mockScript.onload) {
        mockScript.onload();
      }

      const result = await promise;
      expect(result).toBe(mockWebTorrent);
    });

    it('should reject when script fails to load', async () => {
      const { loadWebTorrent } = await import('./webtorrent-loader');
      const promise = loadWebTorrent();

      // Simulate script error
      if (mockScript.onerror) {
        mockScript.onerror('Network error');
      }

      await expect(promise).rejects.toThrow('Failed to load WebTorrent from CDN');
    });
  });

  describe('isWebTorrentLoaded', () => {
    it('should return false when not loaded', async () => {
      const { isWebTorrentLoaded } = await import('./webtorrent-loader');
      expect(isWebTorrentLoaded()).toBe(false);
    });
  });

  describe('getWebTorrent', () => {
    it('should return null when not loaded', async () => {
      const { getWebTorrent } = await import('./webtorrent-loader');
      expect(getWebTorrent()).toBeNull();
    });
  });

  describe('server-side rendering', () => {
    it('should reject loadWebTorrent when window is undefined', async () => {
      // Simulate SSR by setting window to undefined
      Object.defineProperty(globalThis, 'window', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { loadWebTorrent } = await import('./webtorrent-loader');

      await expect(loadWebTorrent()).rejects.toThrow('WebTorrent can only be loaded in browser environment');
    });

    it('should return false for isWebTorrentLoaded when not loaded', async () => {
      // Simulate SSR by setting window to undefined
      Object.defineProperty(globalThis, 'window', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { isWebTorrentLoaded } = await import('./webtorrent-loader');
      expect(isWebTorrentLoaded()).toBe(false);
    });

    it('should return null for getWebTorrent when not loaded', async () => {
      // Simulate SSR by setting window to undefined
      Object.defineProperty(globalThis, 'window', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { getWebTorrent } = await import('./webtorrent-loader');
      expect(getWebTorrent()).toBeNull();
    });
  });

  describe('type exports', () => {
    it('should export all required functions', async () => {
      const loaderExports = await import('./webtorrent-loader');
      expect(loaderExports.loadWebTorrent).toBeDefined();
      expect(loaderExports.isWebTorrentLoaded).toBeDefined();
      expect(loaderExports.getWebTorrent).toBeDefined();
    });
  });
});
