'use client';

/**
 * WebTorrent Browser Loader
 *
 * Loads the WebTorrent browser bundle from CDN to avoid Next.js/Turbopack
 * chunk loading issues. The browser bundle is designed to be loaded via
 * script tag and exposes WebTorrent as a global.
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
  }
}

// CDN URL for WebTorrent browser bundle
// Using jsDelivr CDN which is reliable and fast
const WEBTORRENT_CDN_URL = 'https://cdn.jsdelivr.net/npm/webtorrent@2.8.5/dist/webtorrent.min.js';

// Loading state
let loadPromise: Promise<WebTorrentConstructor> | null = null;
let isLoaded = false;

/**
 * Load WebTorrent from CDN
 *
 * This function loads the WebTorrent browser bundle from a CDN using a script tag.
 * It caches the result so subsequent calls return immediately.
 *
 * @returns Promise that resolves to the WebTorrent constructor
 * @throws Error if loading fails
 */
export function loadWebTorrent(): Promise<WebTorrentConstructor> {
  // Return cached promise if already loading or loaded
  if (loadPromise) {
    return loadPromise;
  }

  // Check if already loaded (e.g., from a previous page load)
  if (isLoaded && typeof window !== 'undefined' && window.WebTorrent) {
    return Promise.resolve(window.WebTorrent);
  }

  // Create loading promise
  loadPromise = new Promise<WebTorrentConstructor>((resolve, reject) => {
    // Ensure we're in browser environment
    if (typeof window === 'undefined') {
      reject(new Error('WebTorrent can only be loaded in browser environment'));
      return;
    }

    // Check if already available (script might have been loaded elsewhere)
    if (window.WebTorrent) {
      isLoaded = true;
      resolve(window.WebTorrent);
      return;
    }

    // Create script element
    const script = document.createElement('script');
    script.src = WEBTORRENT_CDN_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';

    // Handle successful load
    script.onload = () => {
      if (window.WebTorrent) {
        isLoaded = true;
        resolve(window.WebTorrent);
      } else {
        reject(new Error('WebTorrent loaded but not available on window'));
      }
    };

    // Handle load error
    script.onerror = () => {
      loadPromise = null; // Allow retry
      reject(new Error(`Failed to load WebTorrent from CDN: ${WEBTORRENT_CDN_URL}`));
    };

    // Append to document head
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
  return isLoaded && typeof window !== 'undefined' && !!window.WebTorrent;
}

/**
 * Get WebTorrent constructor if loaded
 *
 * @returns WebTorrent constructor or null if not loaded
 */
export function getWebTorrent(): WebTorrentConstructor | null {
  if (typeof window === 'undefined' || !window.WebTorrent) {
    return null;
  }
  return window.WebTorrent;
}
