'use client';

/**
 * WebTorrent Browser Loader
 *
 * Loads the WebTorrent browser bundle from esm.sh CDN using dynamic import.
 * esm.sh is designed for ESM modules and serves with correct MIME types.
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

/**
 * Options for adding a torrent
 */
export interface WebTorrentAddOptions {
  /** Trackers to announce to (in addition to any in the magnet URI) */
  announce?: string[];
  /** Path to download the torrent to (Node.js only) */
  path?: string;
  /** Maximum number of peers to connect to */
  maxWebConns?: number;
}

export interface WebTorrentClient {
  add: (
    magnetUri: string,
    options?: WebTorrentAddOptions | ((torrent: WebTorrentTorrent) => void),
    callback?: (torrent: WebTorrentTorrent) => void
  ) => WebTorrentTorrent;
  get: (infoHash: string) => WebTorrentTorrent | null;
  remove: (infoHash: string, callback?: () => void) => void;
  destroy: (callback?: () => void) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  torrents: WebTorrentTorrent[];
}

export interface WebTorrentConstructor {
  new (): WebTorrentClient;
}

// Extend Window interface for WebTorrent global (for backwards compatibility)
declare global {
  interface Window {
    WebTorrent?: WebTorrentConstructor;
  }
}

// CDN URL for WebTorrent browser bundle
// Using esm.sh which is designed for ESM modules and serves with correct MIME types
const WEBTORRENT_CDN_URL = 'https://esm.sh/webtorrent';

// Loading state
let loadPromise: Promise<WebTorrentConstructor> | null = null;
let cachedConstructor: WebTorrentConstructor | null = null;

/**
 * Load WebTorrent from CDN using dynamic import
 *
 * This function loads the WebTorrent browser bundle from esm.sh CDN.
 * esm.sh serves ESM modules with correct Content-Type: application/javascript
 *
 * @returns Promise that resolves to the WebTorrent constructor
 * @throws Error if loading fails
 */
export function loadWebTorrent(): Promise<WebTorrentConstructor> {
  // Return cached constructor if already loaded
  if (cachedConstructor) {
    return Promise.resolve(cachedConstructor);
  }

  // Check if already loaded on window (e.g., from previous load)
  if (typeof window !== 'undefined' && window.WebTorrent) {
    cachedConstructor = window.WebTorrent;
    return Promise.resolve(cachedConstructor);
  }

  // Return cached promise if already loading
  if (loadPromise) {
    return loadPromise;
  }

  // Create loading promise using dynamic import
  // esm.sh serves proper ESM modules that work with dynamic import
  loadPromise = new Promise<WebTorrentConstructor>((resolve, reject) => {
    // Ensure we're in browser environment
    if (typeof window === 'undefined') {
      loadPromise = null;
      reject(new Error('WebTorrent can only be loaded in browser environment'));
      return;
    }

    // Set timeout for loading (30 seconds)
    const loadTimeout = setTimeout(() => {
      loadPromise = null;
      reject(new Error('WebTorrent CDN load timed out after 30s'));
    }, 30000);

    // Use dynamic import for ESM module from esm.sh
    import(/* webpackIgnore: true */ WEBTORRENT_CDN_URL)
      .then((module: { default?: WebTorrentConstructor }) => {
        clearTimeout(loadTimeout);
        
        // esm.sh exports the constructor as default
        const WebTorrent = module.default;
        
        if (WebTorrent) {
          cachedConstructor = WebTorrent;
          // Also set on window for compatibility
          window.WebTorrent = WebTorrent;
          console.log('[WebTorrent] Loaded successfully from esm.sh CDN');
          resolve(cachedConstructor);
        } else {
          loadPromise = null;
          reject(new Error('WebTorrent module loaded but constructor not found'));
        }
      })
      .catch((error: Error) => {
        clearTimeout(loadTimeout);
        loadPromise = null;
        reject(new Error(`Failed to load WebTorrent from CDN: ${error.message}`));
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
