/**
 * Tests for WebTorrent Browser Loader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original globals
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

describe('webtorrent-loader', () => {
  // Track created scripts
  let createdScripts: Array<{
    src: string;
    async: boolean;
    crossOrigin: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
  }>;

  const mockDocument = {
    createElement: vi.fn(() => {
      const script = {
        src: '',
        async: false,
        crossOrigin: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      createdScripts.push(script);
      return script;
    }),
    head: {
      appendChild: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createdScripts = [];

    // Setup browser environment mocks
    // @ts-expect-error - mocking global for test
    globalThis.document = mockDocument;
    // @ts-expect-error - mocking global for test
    globalThis.window = {};
  });

  afterEach(() => {
    // Restore original globals
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  describe('loadWebTorrent', () => {
    it('should load WebTorrent from CDN and return constructor', async () => {
      const mockWebTorrent = vi.fn();
      
      // Import fresh module
      const { loadWebTorrent } = await import('./webtorrent-loader');

      // Start loading
      const loadPromise = loadWebTorrent();

      // Get the created script element
      expect(createdScripts.length).toBe(1);
      const createdScript = createdScripts[0];
      expect(createdScript.src).toContain('webtorrent');
      expect(createdScript.async).toBe(true);
      expect(createdScript.crossOrigin).toBe('anonymous');

      // Simulate successful load
      (globalThis.window as { WebTorrent?: unknown }).WebTorrent = mockWebTorrent;
      createdScript.onload?.();

      const result = await loadPromise;
      expect(result).toBe(mockWebTorrent);
    });

    it('should return cached result on subsequent calls', async () => {
      const mockWebTorrent = vi.fn();
      // Don't set WebTorrent initially so script is created
      delete (globalThis.window as { WebTorrent?: unknown }).WebTorrent;

      const { loadWebTorrent } = await import('./webtorrent-loader');

      // First call - should create script
      const loadPromise1 = loadWebTorrent();
      expect(createdScripts.length).toBe(1);
      
      // Set WebTorrent before onload
      (globalThis.window as { WebTorrent?: unknown }).WebTorrent = mockWebTorrent;
      createdScripts[0].onload?.();
      await loadPromise1;

      // Clear to track new calls
      const scriptCountBefore = createdScripts.length;

      // Second call - should return cached (no new script)
      const result = await loadWebTorrent();
      expect(result).toBe(mockWebTorrent);
      expect(createdScripts.length).toBe(scriptCountBefore); // No new scripts created
    });

    it('should reject if WebTorrent not available after load', async () => {
      const { loadWebTorrent } = await import('./webtorrent-loader');

      const loadPromise = loadWebTorrent();
      expect(createdScripts.length).toBe(1);

      // Simulate load without WebTorrent being set
      delete (globalThis.window as { WebTorrent?: unknown }).WebTorrent;
      createdScripts[0].onload?.();

      await expect(loadPromise).rejects.toThrow('WebTorrent loaded but not available on window');
    });

    it('should reject on script load error', async () => {
      const { loadWebTorrent } = await import('./webtorrent-loader');

      const loadPromise = loadWebTorrent();
      expect(createdScripts.length).toBe(1);

      // Simulate load error
      createdScripts[0].onerror?.();

      await expect(loadPromise).rejects.toThrow('Failed to load WebTorrent from CDN');
    });

    it('should return immediately if WebTorrent already on window', async () => {
      const mockWebTorrent = vi.fn();
      (globalThis.window as { WebTorrent?: unknown }).WebTorrent = mockWebTorrent;

      const { loadWebTorrent } = await import('./webtorrent-loader');

      const result = await loadWebTorrent();
      expect(result).toBe(mockWebTorrent);
      expect(createdScripts.length).toBe(0); // No script created
    });
  });

  describe('isWebTorrentLoaded', () => {
    it('should return false when not loaded', async () => {
      delete (globalThis.window as { WebTorrent?: unknown }).WebTorrent;

      const { isWebTorrentLoaded } = await import('./webtorrent-loader');
      expect(isWebTorrentLoaded()).toBe(false);
    });

    it('should return true after successful load', async () => {
      const mockWebTorrent = vi.fn();
      // Don't set WebTorrent initially so script is created
      delete (globalThis.window as { WebTorrent?: unknown }).WebTorrent;

      const { loadWebTorrent, isWebTorrentLoaded } = await import('./webtorrent-loader');

      // Load first
      const loadPromise = loadWebTorrent();
      expect(createdScripts.length).toBe(1);
      
      // Set WebTorrent before onload
      (globalThis.window as { WebTorrent?: unknown }).WebTorrent = mockWebTorrent;
      createdScripts[0].onload?.();
      await loadPromise;

      expect(isWebTorrentLoaded()).toBe(true);
    });
  });

  describe('getWebTorrent', () => {
    it('should return null when not loaded', async () => {
      delete (globalThis.window as { WebTorrent?: unknown }).WebTorrent;

      const { getWebTorrent } = await import('./webtorrent-loader');
      expect(getWebTorrent()).toBeNull();
    });

    it('should return constructor when loaded', async () => {
      const mockWebTorrent = vi.fn();
      (globalThis.window as { WebTorrent?: unknown }).WebTorrent = mockWebTorrent;

      const { getWebTorrent } = await import('./webtorrent-loader');
      expect(getWebTorrent()).toBe(mockWebTorrent);
    });
  });

  describe('server-side rendering', () => {
    it('should reject loadWebTorrent when window is undefined', async () => {
      // @ts-expect-error - simulating SSR by removing window
      delete globalThis.window;

      const { loadWebTorrent } = await import('./webtorrent-loader');

      await expect(loadWebTorrent()).rejects.toThrow('WebTorrent can only be loaded in browser environment');
    });

    it('should return false for isWebTorrentLoaded when window is undefined', async () => {
      // @ts-expect-error - simulating SSR by removing window
      delete globalThis.window;

      const { isWebTorrentLoaded } = await import('./webtorrent-loader');
      expect(isWebTorrentLoaded()).toBe(false);
    });

    it('should return null for getWebTorrent when window is undefined', async () => {
      // @ts-expect-error - simulating SSR by removing window
      delete globalThis.window;

      const { getWebTorrent } = await import('./webtorrent-loader');
      expect(getWebTorrent()).toBeNull();
    });
  });
});
