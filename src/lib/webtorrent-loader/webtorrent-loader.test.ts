/**
 * Tests for WebTorrent Browser Loader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original globals
const originalWindow = globalThis.window;

describe('webtorrent-loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Setup browser environment mocks using Object.defineProperty to avoid TS errors
    Object.defineProperty(globalThis, 'window', {
      value: {},
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

    it('should return cached constructor if already loaded on window', async () => {
      const mockWebTorrent = vi.fn();
      (globalThis.window as unknown as Record<string, unknown>).WebTorrent = mockWebTorrent;

      const { loadWebTorrent } = await import('./webtorrent-loader');
      const result = await loadWebTorrent();
      
      expect(result).toBe(mockWebTorrent);
    });

    it('should return cached constructor on subsequent calls', async () => {
      const mockWebTorrent = vi.fn();
      (globalThis.window as unknown as Record<string, unknown>).WebTorrent = mockWebTorrent;

      const { loadWebTorrent } = await import('./webtorrent-loader');
      const result1 = await loadWebTorrent();
      const result2 = await loadWebTorrent();
      
      expect(result1).toBe(result2);
      expect(result1).toBe(mockWebTorrent);
    });
  });

  describe('isWebTorrentLoaded', () => {
    it('should return false when not loaded', async () => {
      const { isWebTorrentLoaded } = await import('./webtorrent-loader');
      expect(isWebTorrentLoaded()).toBe(false);
    });

    it('should return true after loading from window', async () => {
      const mockWebTorrent = vi.fn();
      (globalThis.window as unknown as Record<string, unknown>).WebTorrent = mockWebTorrent;

      const { loadWebTorrent, isWebTorrentLoaded } = await import('./webtorrent-loader');
      await loadWebTorrent();
      
      expect(isWebTorrentLoaded()).toBe(true);
    });
  });

  describe('getWebTorrent', () => {
    it('should return null when not loaded', async () => {
      const { getWebTorrent } = await import('./webtorrent-loader');
      expect(getWebTorrent()).toBeNull();
    });

    it('should return constructor after loading', async () => {
      const mockWebTorrent = vi.fn();
      (globalThis.window as unknown as Record<string, unknown>).WebTorrent = mockWebTorrent;

      const { loadWebTorrent, getWebTorrent } = await import('./webtorrent-loader');
      await loadWebTorrent();
      
      expect(getWebTorrent()).toBe(mockWebTorrent);
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
