'use client';

/**
 * WebTorrent Browser Loader
 *
 * Loads the WebTorrent browser bundle from jsDelivr CDN using dynamic import.
 * The webtorrent.min.js file is an ES module that exports the WebTorrent class as default.
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
// Using unpkg which serves the UMD bundle that works better with dynamic import
const WEBTORRENT_CDN_URL = 'https://unpkg.com/webtorrent@2.5.1/webtorrent.min.js';

// Loading state
let loadPromise: Promise<WebTorrentConstructor> | null = null;
let cachedConstructor: WebTorrentConstructor | null = null;

/**
 * Load WebTorrent from CDN using script tag injection
 *
 * This function loads the WebTorrent browser bundle from unpkg CDN.
 * The UMD bundle sets window.WebTorrent as the constructor.
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

  // Create loading promise using script tag injection
  // This is more reliable than dynamic import for UMD bundles
  loadPromise = new Promise<WebTorrentConstructor>((resolve, reject) => {
    // Ensure we're in browser environment
    if (typeof window === 'undefined') {
      loadPromise = null;
      reject(new Error('WebTorrent can only be loaded in browser environment'));
      return;
    }

    // Create script element
    const script = document.createElement('script');
    script.src = WEBTORRENT_CDN_URL;
    script.async = true;

    // Set timeout for loading (30 seconds)
    const loadTimeout = setTimeout(() => {
      loadPromise = null;
      script.remove();
      reject(new Error('WebTorrent CDN load timed out after 30s'));
    }, 30000);

    script.onload = () => {
      clearTimeout(loadTimeout);
      
      // Check if WebTorrent is now available on window
      if (window.WebTorrent) {
        cachedConstructor = window.WebTorrent;
        console.log('[WebTorrent] Loaded successfully from CDN');
        resolve(cachedConstructor);
      } else {
        loadPromise = null;
        reject(new Error('WebTorrent script loaded but constructor not found on window'));
      }
    };

    script.onerror = (event) => {
      clearTimeout(loadTimeout);
      loadPromise = null;
      script.remove();
      reject(new Error(`Failed to load WebTorrent from CDN: ${event}`));
    };

    // Append script to document head
    document.head.appendChild(script);
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
