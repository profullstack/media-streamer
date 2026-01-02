'use client';

/**
 * Client-side WebTorrent Hook
 *
 * Enables P2P streaming directly in the browser for native-compatible formats.
 * This reduces server load and bandwidth by streaming directly from peers.
 *
 * For formats that require transcoding (MKV, FLAC, etc.), the server-side
 * streaming endpoint should be used instead.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// WebTorrent types for browser bundle
// These match the types in src/types/webtorrent-browser.d.ts
interface WebTorrentFile {
  name: string;
  length: number;
  path: string;
  streamURL: string;
  getBlobURL: (callback: (err: Error | null, url?: string) => void) => void;
}

interface WebTorrentTorrent {
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

interface WebTorrentClient {
  add: (magnetUri: string, callback?: (torrent: WebTorrentTorrent) => void) => WebTorrentTorrent;
  get: (infoHash: string) => WebTorrentTorrent | null;
  remove: (infoHash: string, callback?: () => void) => void;
  destroy: (callback?: () => void) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  torrents: WebTorrentTorrent[];
}

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

  /**
   * Initialize WebTorrent client lazily
   */
  const getClient = useCallback(async (): Promise<WebTorrentClient> => {
    if (clientRef.current) {
      return clientRef.current;
    }

    // Dynamic import of browser-compatible WebTorrent bundle
    // This is the minified browser build that works in browsers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const WebTorrentModule = await import('webtorrent/dist/webtorrent.min.js') as { default: new () => WebTorrentClient };
    const WebTorrent = WebTorrentModule.default;
    const client = new WebTorrent();
    clientRef.current = client;

    client.on('error', (err: unknown) => {
      console.error('[useWebTorrent] Client error:', err);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    });

    return client;
  }, []);

  /**
   * Update stats from torrent
   */
  const updateStats = useCallback(() => {
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
        // Add new torrent
        torrent = await new Promise<WebTorrentTorrent>((resolve, reject) => {
          try {
            const t = client.add(magnetUri, (addedTorrent) => {
              resolve(addedTorrent);
            });

            // Handle errors during add
            t.on('error', (err: unknown) => {
              reject(err instanceof Error ? err : new Error(String(err)));
            });
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      }

      currentTorrentRef.current = torrent;

      // Wait for torrent to be ready
      if (!torrent.ready) {
        await new Promise<void>((resolve) => {
          torrent!.on('ready', () => resolve());
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
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
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
    return () => {
      // Clear stats interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }

      // Revoke blob URL
      if (streamUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(streamUrlRef.current);
      }

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
