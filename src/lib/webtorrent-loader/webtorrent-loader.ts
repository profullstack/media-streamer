'use client';

/**
 * WebTorrent Browser Loader
 *
 * Loads the WebTorrent browser bundle from jsDelivr CDN.
 * The webtorrent.min.js file is a UMD bundle that sets window.WebTorrent.
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

// CDN URL for WebTorrent browser bundle - UMD version that sets window.WebTorrent
const WEBTORRENT_CDN_URL = 'https://cdn.jsdelivr.net/npm/webtorrent@2.8.5/dist/webtorrent.min.js';

// Loading state
let loadPromise: Promise<WebTorrentConstructor> | null = null;
let cachedConstructor: WebTorrentConstructor | null = null;

/**
 * Load WebTorrent from CDN using script tag
 *
 * This function loads the WebTorrent browser bundle from jsDelivr CDN.
 * The UMD bundle sets window.WebTorrent which we then use.
 *
 * @returns Promise that resolves to the WebTorrent constructor
 * @throws Error if loading fails
 */
export function loadWebTorrent(): Promise<WebTorrentConstructor> {
  // Return cached constructor if already loaded
  if (cachedConstructor) {
    return Promise.resolve(cachedConstructor);
  }

  // Check if already loaded on window
  if (typeof window !== 'undefined' && window.WebTorrent) {
    cachedConstructor = window.WebTorrent;
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

    // Check if script is already in DOM
    const existingScript = document.querySelector(`script[src="${WEBTORRENT_CDN_URL}"]`);
    if (existingScript) {
      // Wait for it to load
      const checkLoaded = (): void => {
        if (window.WebTorrent) {
          cachedConstructor = window.WebTorrent;
          resolve(cachedConstructor);
        } else {
          setTimeout(checkLoaded, 50);
        }
      };
      checkLoaded();
      return;
    }

    // Create and load script
    const script = document.createElement('script');
    script.src = WEBTORRENT_CDN_URL;
    script.async = true;

    script.onload = (): void => {
      if (window.WebTorrent) {
        cachedConstructor = window.WebTorrent;
        resolve(cachedConstructor);
      } else {
        loadPromise = null;
        reject(new Error('WebTorrent script loaded but window.WebTorrent not available'));
      }
    };

    script.onerror = (): void => {
      loadPromise = null;
      reject(new Error('Failed to load WebTorrent from CDN'));
    };

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
