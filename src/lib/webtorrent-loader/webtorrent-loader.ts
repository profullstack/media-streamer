'use client';

/**
 * WebTorrent Browser Loader
 *
 * Loads the WebTorrent browser bundle using dynamic import with ES modules.
 * WebTorrent 2.x uses ES module exports, not UMD globals.
 */

// WebTorrent types for browser bundle
export interface WebTorrentFile {
  name: string;
  length: number;
  path: string;
  streamURL: string;
  getBlobURL: (callback: (err: Error | null, url?: string) => void) => void;
}

export interface WebTorrentTorrent {
  infoHash: string;
  name: string;
  files: WebTorrentFile[];
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  ready: boolean;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  destroy: (callback?: () => void) => void;
}

export interface WebTorrentClient {
  add: (magnetUri: string, callback?: (torrent: WebTorrentTorrent) => void) => WebTorrentTorrent;
  get: (infoHash: string) => WebTorrentTorrent | null;
  remove: (infoHash: string, callback?: () => void) => void;
  destroy: (callback?: () => void) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  torrents: WebTorrentTorrent[];
}

export interface WebTorrentConstructor {
  new (): WebTorrentClient;
}

// Extend Window interface for WebTorrent global
declare global {
  interface Window {
    WebTorrent?: WebTorrentConstructor;
    __webtorrentModule?: { default: WebTorrentConstructor };
  }
}

// CDN URL for WebTorrent browser bundle - using ESM version
const WEBTORRENT_ESM_CDN_URL = 'https://esm.sh/webtorrent@2.8.5';

// Loading state
let loadPromise: Promise<WebTorrentConstructor> | null = null;
let cachedConstructor: WebTorrentConstructor | null = null;

/**
 * Load WebTorrent from CDN using dynamic import
 *
 * This function loads the WebTorrent browser bundle from esm.sh CDN
 * which provides ES module compatible builds.
 *
 * @returns Promise that resolves to the WebTorrent constructor
 * @throws Error if loading fails
 */
export function loadWebTorrent(): Promise<WebTorrentConstructor> {
  // Return cached constructor if already loaded
  if (cachedConstructor) {
    return Promise.resolve(cachedConstructor);
  }

  // Return cached promise if already loading
  if (loadPromise) {
    return loadPromise;
  }

  // Create loading promise
  loadPromise = new Promise<WebTorrentConstructor>((resolve, reject) => {
    // Ensure we're in browser environment
    if (typeof window === 'undefined') {
      reject(new Error('WebTorrent can only be loaded in browser environment'));
      return;
    }

    // Use dynamic import with esm.sh CDN
    // esm.sh provides browser-compatible ES module builds
    import(/* webpackIgnore: true */ WEBTORRENT_ESM_CDN_URL)
      .then((module: { default: WebTorrentConstructor }) => {
        if (module && module.default) {
          cachedConstructor = module.default;
          resolve(module.default);
        } else {
          reject(new Error('WebTorrent module loaded but default export not found'));
        }
      })
      .catch((err: Error) => {
        loadPromise = null; // Allow retry
        reject(new Error(`Failed to load WebTorrent from CDN: ${err.message}`));
      });
  });

  return loadPromise;
}

/**
 * Check if WebTorrent is loaded
 *
 * @returns true if WebTorrent is loaded and available
 */
export function isWebTorrentLoaded(): boolean {
  return cachedConstructor !== null;
}

/**
 * Get WebTorrent constructor if loaded
 *
 * @returns WebTorrent constructor or null if not loaded
 */
export function getWebTorrent(): WebTorrentConstructor | null {
  return cachedConstructor;
}
