'use client';

/**
 * WebTorrent Browser Loader
 *
 * Loads the WebTorrent browser bundle from local static files.
 * The browser bundle is a UMD build that includes all necessary polyfills
 * and is designed to work correctly in browsers with WebRTC support.
 *
 * Note: We use a local copy of the UMD bundle because:
 * 1. CDNs may have CORS or Content-Type header issues
 * 2. esm.sh serves the Node.js version which has polyfill issues
 * 3. The official browser bundle is pre-built with all browser-specific code
 * 4. Local files are served with correct headers by Next.js
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

/**
 * WebTorrent client options
 */
export interface WebTorrentClientOptions {
  /** Maximum number of peers to connect to per torrent */
  maxConns?: number;
  /** Node ID (20 bytes) */
  nodeId?: string | Buffer;
  /** Peer ID (20 bytes) */
  peerId?: string | Buffer;
  /** Tracker options */
  tracker?: {
    /** RTCPeerConnection configuration for WebRTC */
    rtcConfig?: RTCConfiguration;
    /** Announce URL */
    announce?: string[];
    /** Get announce URLs */
    getAnnounceOpts?: () => Record<string, unknown>;
  };
  /** DHT options (false to disable) */
  dht?: boolean | Record<string, unknown>;
  /** LSD options (false to disable) */
  lsd?: boolean;
  /** WebSeeds options (false to disable) */
  webSeeds?: boolean;
  /** uTP options (false to disable, Node.js only) */
  utp?: boolean;
}

export interface WebTorrentConstructor {
  new (options?: WebTorrentClientOptions): WebTorrentClient;
}

// Extend Window interface for WebTorrent global
declare global {
  interface Window {
    WebTorrent?: WebTorrentConstructor;
  }
}

// Local path for WebTorrent browser bundle (UMD build)
// This is the official browser bundle that includes all necessary polyfills
// Served from public/libs/ with correct Content-Type headers by Next.js
const WEBTORRENT_LOCAL_PATH = '/libs/webtorrent.min.js';

// Loading state
let loadPromise: Promise<WebTorrentConstructor> | null = null;
let cachedConstructor: WebTorrentConstructor | null = null;

/**
 * Load WebTorrent from CDN using script tag
 *
 * This function loads the WebTorrent browser bundle from jsdelivr CDN.
 * The UMD bundle sets window.WebTorrent when loaded.
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

  // Create loading promise using script tag
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

    // Create script element to load UMD bundle
    const script = document.createElement('script');
    script.src = WEBTORRENT_LOCAL_PATH;
    script.async = true;
    
    script.onload = () => {
      clearTimeout(loadTimeout);
      
      // UMD bundle sets window.WebTorrent
      const WebTorrent = window.WebTorrent;
      
      if (WebTorrent) {
        cachedConstructor = WebTorrent;
        console.log('[WebTorrent] Loaded successfully from jsdelivr CDN (UMD bundle)');
        resolve(cachedConstructor);
      } else {
        loadPromise = null;
        reject(new Error('WebTorrent script loaded but constructor not found on window'));
      }
    };
    
    script.onerror = () => {
      clearTimeout(loadTimeout);
      loadPromise = null;
      reject(new Error('Failed to load WebTorrent from CDN'));
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
