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

    // Setup browser environment mocks
    // @ts-expect-error - mocking global for test
    globalThis.window = {};
  });

  afterEach(() => {
    // Restore original globals
    globalThis.window = originalWindow;
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
      // @ts-expect-error - simulating SSR by removing window
      delete globalThis.window;

      const { loadWebTorrent } = await import('./webtorrent-loader');

      await expect(loadWebTorrent()).rejects.toThrow('WebTorrent can only be loaded in browser environment');
    });

    it('should return false for isWebTorrentLoaded when not loaded', async () => {
      // @ts-expect-error - simulating SSR by removing window
      delete globalThis.window;

      const { isWebTorrentLoaded } = await import('./webtorrent-loader');
      expect(isWebTorrentLoaded()).toBe(false);
    });

    it('should return null for getWebTorrent when not loaded', async () => {
      // @ts-expect-error - simulating SSR by removing window
      delete globalThis.window;

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
