'use client';

/**
 * Client-side WebTorrent Hook
 *
 * Enables P2P streaming directly in the browser for native-compatible formats.
 * This reduces server load and bandwidth by streaming directly from peers.
 *
 * For formats that require transcoding (MKV, FLAC, etc.), the server-side
 * streaming endpoint should be used instead.
 *
 * IMPORTANT: Browser WebTorrent Peer Discovery
 * - Browsers cannot use UDP trackers or traditional DHT (requires raw UDP sockets)
 * - WebTorrent uses WebRTC for peer-to-peer connections
 * - WebSocket trackers are required for initial peer discovery (signaling)
 * - Once connected, WebTorrent can use WebRTC-based DHT and PEX for more peers
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  loadWebTorrent,
  type WebTorrentClient,
  type WebTorrentTorrent,
} from '../lib/webtorrent-loader';

/**
 * WebSocket trackers for browser WebTorrent peer discovery
 * These are required because browsers cannot use UDP trackers
 * They serve as signaling servers for WebRTC peer connections
 */
const WEBTORRENT_TRACKERS: readonly string[] = [
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

/**
 * Available STUN servers for WebRTC NAT traversal
 * One will be randomly selected to avoid overloading any single server
 */
const STUN_SERVERS: readonly string[] = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
];

/**
 * Available TURN servers for relaying traffic when direct connections fail
 * One will be randomly selected to distribute load
 */
const TURN_SERVERS: readonly RTCIceServer[] = [
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/**
 * Get ICE servers configuration with randomly selected STUN and TURN servers
 * This distributes load across multiple servers
 */
function getIceServers(): RTCIceServer[] {
  const randomStun = STUN_SERVERS[Math.floor(Math.random() * STUN_SERVERS.length)];
  const randomTurn = TURN_SERVERS[Math.floor(Math.random() * TURN_SERVERS.length)];
  return [
    { urls: randomStun },
    randomTurn,
  ];
}

/**
 * Timeout for adding a torrent (waiting for metadata from peers)
 * This is the time to wait for the torrent to be added and metadata to be received
 * 60 seconds allows time for peer discovery via WebRTC signaling
 */
const TORRENT_ADD_TIMEOUT_MS = 60000;

/**
 * Timeout for torrent to become ready after being added
 * This is additional time after metadata is received for the torrent to be fully ready
 */
const TORRENT_READY_TIMEOUT_MS = 15000;

/**
 * Native video formats that browsers can play without transcoding
 * These use standard codecs (H.264, VP8/VP9, Theora) in supported containers
 */
export const NATIVE_VIDEO_FORMATS: readonly string[] = ['mp4', 'webm', 'ogv', 'm4v'];

/**
 * Native audio formats that browsers can play without transcoding
 * Note: FLAC is NOT included because iOS Safari doesn't support it
 */
export const NATIVE_AUDIO_FORMATS: readonly string[] = ['mp3', 'wav', 'ogg', 'aac', 'm4a'];

/**
 * All native-compatible formats
 */
const NATIVE_FORMATS = new Set<string>([...NATIVE_VIDEO_FORMATS, ...NATIVE_AUDIO_FORMATS]);

/**
 * Check if a filename has a native-compatible format
 * @param filename - The filename to check
 * @returns true if the format is native-compatible
 */
export function isNativeCompatible(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return false;
  return NATIVE_FORMATS.has(ext);
}

/**
 * Stream status
 */
export type StreamStatus = 'idle' | 'loading' | 'buffering' | 'ready' | 'error';

/**
 * Stream options
 */
export interface StreamOptions {
  magnetUri: string;
  fileIndex: number;
  fileName: string;
}

/**
 * WebTorrent hook state
 */
export interface WebTorrentState {
  status: StreamStatus;
  streamUrl: string | null;
  error: string | null;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
}

/**
 * WebTorrent hook return type
 */
export interface UseWebTorrentReturn extends WebTorrentState {
  startStream: (options: StreamOptions) => void;
  stopStream: () => void;
}

/**
 * Client-side WebTorrent streaming hook
 *
 * Provides P2P streaming for native-compatible media formats.
 * For non-native formats, returns an error - use server-side streaming instead.
 */
export function useWebTorrent(): UseWebTorrentReturn {
  const [state, setState] = useState<WebTorrentState>({
    status: 'idle',
    streamUrl: null,
    error: null,
    progress: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    numPeers: 0,
  });

  const clientRef = useRef<WebTorrentClient | null>(null);
  const currentTorrentRef = useRef<WebTorrentTorrent | null>(null);
  const streamUrlRef = useRef<string | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  /**
   * Initialize WebTorrent client lazily
   */
  const getClient = useCallback(async (): Promise<WebTorrentClient> => {
    if (clientRef.current) {
      return clientRef.current;
    }

    // Load WebTorrent from local bundle to avoid Next.js/Turbopack chunk loading issues
    const WebTorrent = await loadWebTorrent();
    
    // Configure WebTorrent with ICE servers for WebRTC NAT traversal
    // This is essential for browsers behind NAT/firewalls (most users)
    // and for privacy-focused browsers like LibreWolf that may block default STUN servers
    const client = new WebTorrent({
      tracker: {
        rtcConfig: {
          iceServers: getIceServers(),
        },
      },
    });
    clientRef.current = client;

    client.on('error', (err: unknown) => {
      console.error('[useWebTorrent] Client error:', err);
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    });

    return client;
  }, []);

  /**
   * Update stats from torrent
   * Only updates state if component is still mounted
   */
  const updateStats = useCallback(() => {
    // Don't update state if component is unmounted
    if (!isMountedRef.current) return;
    
    const torrent = currentTorrentRef.current;
    if (!torrent) return;

    setState(prev => ({
      ...prev,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      numPeers: torrent.numPeers,
    }));
  }, []);

  /**
   * Start streaming a file from a torrent
   */
  const startStream = useCallback(async (options: StreamOptions): Promise<void> => {
    const { magnetUri, fileIndex, fileName } = options;

    // Check if format is native-compatible
    if (!isNativeCompatible(fileName)) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: `Format "${fileName.split('.').pop()}" is not native-compatible. Use server-side streaming with transcoding.`,
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      status: 'loading',
      error: null,
      progress: 0,
    }));

    try {
      const client = await getClient();

      // Extract infohash from magnet URI
      const infoHashMatch = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]+)/);
      const infoHash = infoHashMatch?.[1]?.toLowerCase();

      // Check if torrent is already loaded
      let torrent = infoHash ? client.get(infoHash) : null;

      if (!torrent) {
        // Add new torrent with WebSocket trackers for browser peer discovery
        // These trackers are essential because browsers cannot use UDP trackers
        // They serve as signaling servers for WebRTC peer connections
        torrent = await new Promise<WebTorrentTorrent>((resolve, reject) => {
          // Set timeout for torrent add operation
          const addTimeout = setTimeout(() => {
            reject(new Error(`Torrent add timed out after ${TORRENT_ADD_TIMEOUT_MS / 1000}s. No peers found or trackers unreachable.`));
          }, TORRENT_ADD_TIMEOUT_MS);

          try {
            const t = client.add(magnetUri, {
              // Add WebSocket trackers for peer discovery
              // These will be used in addition to any trackers in the magnet URI
              announce: [...WEBTORRENT_TRACKERS],
            }, (addedTorrent) => {
              clearTimeout(addTimeout);
              resolve(addedTorrent);
            });

            // Handle errors during add
            t.on('error', (err: unknown) => {
              clearTimeout(addTimeout);
              reject(err instanceof Error ? err : new Error(String(err)));
            });
          } catch (err) {
            clearTimeout(addTimeout);
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      }

      currentTorrentRef.current = torrent;

      // Wait for torrent to be ready with timeout
      if (!torrent.ready) {
        await new Promise<void>((resolve, reject) => {
          const readyTimeout = setTimeout(() => {
            reject(new Error(`Torrent ready timed out after ${TORRENT_READY_TIMEOUT_MS / 1000}s. Metadata may be incomplete.`));
          }, TORRENT_READY_TIMEOUT_MS);

          torrent!.on('ready', () => {
            clearTimeout(readyTimeout);
            resolve();
          });

          // Also handle errors during ready wait
          torrent!.on('error', (err: unknown) => {
            clearTimeout(readyTimeout);
            reject(err instanceof Error ? err : new Error(String(err)));
          });
        });
      }

      // Get the file
      const file = torrent.files[fileIndex];
      if (!file) {
        throw new Error(`File not found at index ${fileIndex}`);
      }

      setState(prev => ({
        ...prev,
        status: 'buffering',
      }));

      // Use streamURL for streaming (more efficient than blob URL)
      const streamUrl = file.streamURL;
      streamUrlRef.current = streamUrl;

      // Start stats update interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      statsIntervalRef.current = setInterval(updateStats, 1000);

      // Listen for download progress
      torrent.on('download', updateStats);

      setState(prev => ({
        ...prev,
        status: 'ready',
        streamUrl,
        progress: torrent!.progress,
        downloadSpeed: torrent!.downloadSpeed,
        uploadSpeed: torrent!.uploadSpeed,
        numPeers: torrent!.numPeers,
      }));

      console.log('[useWebTorrent] Stream ready:', {
        fileName: file.name,
        fileSize: file.length,
        streamUrl,
        numPeers: torrent.numPeers,
      });
    } catch (err) {
      console.error('[useWebTorrent] Failed to start stream:', err);
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }
  }, [getClient, updateStats]);

  /**
   * Stop streaming and cleanup
   */
  const stopStream = useCallback(() => {
    // Clear stats interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    // Revoke blob URL if it was created
    if (streamUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(streamUrlRef.current);
    }
    streamUrlRef.current = null;

    // Remove download listener
    if (currentTorrentRef.current) {
      currentTorrentRef.current.off('download', updateStats);
    }
    currentTorrentRef.current = null;

    setState({
      status: 'idle',
      streamUrl: null,
      error: null,
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
    });
  }, [updateStats]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    // Mark as mounted
    isMountedRef.current = true;
    
    return () => {
      // Mark as unmounted to prevent state updates
      isMountedRef.current = false;
      
      // Clear stats interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }

      // Revoke blob URL
      if (streamUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(streamUrlRef.current);
      }
      streamUrlRef.current = null;

      // Clear torrent ref
      currentTorrentRef.current = null;

      // Destroy client
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    startStream,
    stopStream,
  };
}
