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
 *
 * TURN Server Integration:
 * - Fetches time-limited TURN credentials from /api/turn-credentials
 * - Uses self-hosted Coturn server for NAT traversal
 * - Credentials are cached and refreshed before expiry
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  loadWebTorrent,
  type WebTorrentClient,
  type WebTorrentTorrent,
  type WebTorrentFile,
  type WebTorrentClientOptions,
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
 * Timeout for adding a torrent (waiting for metadata from peers)
 * This is the time to wait for the torrent to be added and metadata to be received
 * 60 seconds allows time for peer discovery via WebRTC signaling
 */
const TORRENT_ADD_TIMEOUT_MS = 60000;

/**
 * Timeout for peer discovery after torrent is ready
 * If no WebRTC peers are found within this time, we signal to fall back to server streaming
 * 10 seconds is enough time for WebSocket tracker responses
 */
const PEER_DISCOVERY_TIMEOUT_MS = 10000;

/**
 * Minimum number of peers required to continue with P2P streaming
 * If fewer peers are found, fall back to server streaming
 */
const MIN_PEERS_FOR_P2P = 1;

/**
 * Buffer thresholds for streaming
 * These match the server-side thresholds in /api/stream/status
 * We need enough data buffered before starting playback to avoid stuttering
 */
const VIDEO_BUFFER_THRESHOLD = 10 * 1024 * 1024; // 10MB for video
const AUDIO_BUFFER_THRESHOLD = 2 * 1024 * 1024;  // 2MB for audio

/**
 * Interval for checking buffer progress (ms)
 */
const BUFFER_CHECK_INTERVAL_MS = 500;

/**
 * TURN credentials response from the API
 */
interface TurnCredentialsResponse {
  iceServers: Array<{
    urls: string[];
    username: string;
    credential: string;
  }>;
  ttl: number;
}

/**
 * Cached TURN credentials
 */
let cachedTurnCredentials: TurnCredentialsResponse | null = null;
let credentialsExpiresAt = 0;

/**
 * Fetch TURN credentials from the API
 * Credentials are cached and refreshed when they're about to expire
 */
async function fetchTurnCredentials(): Promise<RTCIceServer[]> {
  const now = Date.now();
  
  // Return cached credentials if still valid (with 5 minute buffer)
  if (cachedTurnCredentials && credentialsExpiresAt > now + 300000) {
    return cachedTurnCredentials.iceServers;
  }

  try {
    const response = await fetch('/api/ice/turn');
    if (!response.ok) {
      console.warn('[useWebTorrent] Failed to fetch TURN credentials:', response.status);
      return [];
    }

    const data: TurnCredentialsResponse = await response.json();
    
    // Cache the credentials
    cachedTurnCredentials = data;
    credentialsExpiresAt = now + (data.ttl * 1000);
    
    console.log('[useWebTorrent] TURN credentials fetched, expires in', data.ttl, 'seconds');
    return data.iceServers;
  } catch (error) {
    console.warn('[useWebTorrent] Error fetching TURN credentials:', error);
    return [];
  }
}

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
 * Set of video formats for quick lookup
 */
const VIDEO_FORMATS_SET = new Set<string>(NATIVE_VIDEO_FORMATS);

/**
 * All native-compatible formats
 */
const NATIVE_FORMATS = new Set<string>([...NATIVE_VIDEO_FORMATS, ...NATIVE_AUDIO_FORMATS]);

/**
 * Get the buffer threshold for a file based on its extension
 * Video files need more data buffered than audio files
 * @param filename - The filename to check
 * @returns The buffer threshold in bytes
 */
function getBufferThreshold(filename: string): number {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && VIDEO_FORMATS_SET.has(ext)) {
    return VIDEO_BUFFER_THRESHOLD;
  }
  return AUDIO_BUFFER_THRESHOLD;
}

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
 * - 'idle': No stream active
 * - 'loading': Loading WebTorrent client and adding torrent
 * - 'buffering': Torrent added, waiting for data
 * - 'ready': Stream URL available, playback can begin
 * - 'no-peers': No WebRTC peers found after timeout, should fall back to server streaming
 * - 'error': An error occurred
 */
export type StreamStatus = 'idle' | 'loading' | 'buffering' | 'ready' | 'no-peers' | 'error';

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
  /** Bytes downloaded for the selected file */
  downloadedBytes: number;
  /** Total size of the selected file */
  fileSize: number;
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
    downloadedBytes: 0,
    fileSize: 0,
  });

  const clientRef = useRef<WebTorrentClient | null>(null);
  const currentTorrentRef = useRef<WebTorrentTorrent | null>(null);
  const streamUrlRef = useRef<string | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerDiscoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track the current file being streamed for buffer checking
  const currentFileRef = useRef<WebTorrentFile | null>(null);
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
    
    // Fetch TURN credentials from our self-hosted Coturn server
    // This enables NAT traversal for users behind firewalls
    const iceServers = await fetchTurnCredentials();
    
    // Configure WebTorrent with ICE servers if available
    // If no TURN server is configured, WebTorrent will use its defaults
    const options: WebTorrentClientOptions = {};
    if (iceServers.length > 0) {
      options.tracker = {
        rtcConfig: {
          iceServers,
        },
      };
      console.log('[useWebTorrent] Using self-hosted TURN server');
    } else {
      console.log('[useWebTorrent] No TURN server configured, using WebTorrent defaults');
    }
    
    const client = new WebTorrent(options);
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

    const file = currentFileRef.current;

    setState(prev => ({
      ...prev,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      numPeers: torrent.numPeers,
      downloadedBytes: file?.downloaded ?? 0,
      fileSize: file?.length ?? 0,
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

      // Deselect all files first to focus bandwidth on the selected file
      // This is important for streaming - we don't want to download the entire torrent
      torrent.files.forEach((f, i) => {
        if (i !== fileIndex) {
          f.deselect();
        }
      });

      // Select the file we want to stream - this prioritizes downloading it
      // and enables progressive streaming from the beginning of the file
      file.select();

      // Store file reference for buffer checking
      currentFileRef.current = file;

      // Use streamURL for streaming (more efficient than blob URL)
      // This is a service worker URL that serves data as it's downloaded
      const streamUrl = file.streamURL;
      streamUrlRef.current = streamUrl;

      // Calculate buffer threshold based on file type (video vs audio)
      const bufferThreshold = getBufferThreshold(fileName);

      console.log('[useWebTorrent] File selected for streaming:', {
        fileName: file.name,
        fileSize: file.length,
        fileIndex,
        totalFiles: torrent.files.length,
        bufferThreshold,
        bufferThresholdMB: (bufferThreshold / (1024 * 1024)).toFixed(1),
      });

      // Start stats update interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      statsIntervalRef.current = setInterval(updateStats, 1000);

      // Listen for download progress
      torrent.on('download', updateStats);

      // Update state with initial values (still buffering)
      setState(prev => ({
        ...prev,
        streamUrl,
        progress: torrent!.progress,
        downloadSpeed: torrent!.downloadSpeed,
        uploadSpeed: torrent!.uploadSpeed,
        numPeers: torrent!.numPeers,
        downloadedBytes: file.downloaded,
        fileSize: file.length,
      }));

      // Start buffer check interval - only set status to 'ready' when buffer threshold is reached
      // This matches the server-side behavior where we wait for 10MB video / 2MB audio before playback
      if (bufferCheckIntervalRef.current) {
        clearInterval(bufferCheckIntervalRef.current);
      }

      bufferCheckIntervalRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        
        const currentFile = currentFileRef.current;
        if (!currentFile) return;

        const downloaded = currentFile.downloaded;
        const fileSize = currentFile.length;

        console.log('[useWebTorrent] Buffer check:', {
          downloaded,
          downloadedMB: (downloaded / (1024 * 1024)).toFixed(2),
          bufferThreshold,
          bufferThresholdMB: (bufferThreshold / (1024 * 1024)).toFixed(1),
          progress: ((downloaded / bufferThreshold) * 100).toFixed(1) + '%',
        });

        // Check if we've buffered enough data OR if the file is smaller than the threshold
        // (small files should be playable immediately once fully downloaded)
        if (downloaded >= bufferThreshold || downloaded >= fileSize) {
          // Clear the buffer check interval - we're ready
          if (bufferCheckIntervalRef.current) {
            clearInterval(bufferCheckIntervalRef.current);
            bufferCheckIntervalRef.current = null;
          }

          console.log('[useWebTorrent] Buffer threshold reached, stream ready:', {
            downloaded,
            downloadedMB: (downloaded / (1024 * 1024)).toFixed(2),
            bufferThreshold,
            bufferThresholdMB: (bufferThreshold / (1024 * 1024)).toFixed(1),
            streamUrl,
          });

          setState(prev => ({
            ...prev,
            status: 'ready',
            downloadedBytes: downloaded,
            fileSize,
          }));
        }
      }, BUFFER_CHECK_INTERVAL_MS);

      // Start peer discovery timeout - if no peers found after timeout, signal fallback
      // Clear any existing timeout first
      if (peerDiscoveryTimeoutRef.current) {
        clearTimeout(peerDiscoveryTimeoutRef.current);
      }

      peerDiscoveryTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        
        const currentTorrent = currentTorrentRef.current;
        if (!currentTorrent) return;

        const numPeers = currentTorrent.numPeers;
        console.log('[useWebTorrent] Peer discovery timeout reached:', {
          numPeers,
          minRequired: MIN_PEERS_FOR_P2P,
        });

        if (numPeers < MIN_PEERS_FOR_P2P) {
          console.log('[useWebTorrent] Not enough WebRTC peers found, signaling fallback to server streaming');
          
          // Clear buffer check interval since we're falling back
          if (bufferCheckIntervalRef.current) {
            clearInterval(bufferCheckIntervalRef.current);
            bufferCheckIntervalRef.current = null;
          }
          
          setState(prev => ({
            ...prev,
            status: 'no-peers',
          }));
        } else {
          console.log('[useWebTorrent] Sufficient peers found, continuing with P2P streaming');
        }
      }, PEER_DISCOVERY_TIMEOUT_MS);
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

    // Clear peer discovery timeout
    if (peerDiscoveryTimeoutRef.current) {
      clearTimeout(peerDiscoveryTimeoutRef.current);
      peerDiscoveryTimeoutRef.current = null;
    }

    // Clear buffer check interval
    if (bufferCheckIntervalRef.current) {
      clearInterval(bufferCheckIntervalRef.current);
      bufferCheckIntervalRef.current = null;
    }

    // Revoke blob URL if it was created
    if (streamUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(streamUrlRef.current);
    }
    streamUrlRef.current = null;

    // Clear file reference
    currentFileRef.current = null;

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
      downloadedBytes: 0,
      fileSize: 0,
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

      // Clear peer discovery timeout
      if (peerDiscoveryTimeoutRef.current) {
        clearTimeout(peerDiscoveryTimeoutRef.current);
        peerDiscoveryTimeoutRef.current = null;
      }

      // Clear buffer check interval
      if (bufferCheckIntervalRef.current) {
        clearInterval(bufferCheckIntervalRef.current);
        bufferCheckIntervalRef.current = null;
      }

      // Revoke blob URL
      if (streamUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(streamUrlRef.current);
      }
      streamUrlRef.current = null;

      // Clear file reference
      currentFileRef.current = null;

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
