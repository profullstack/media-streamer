'use client';

/**
 * Media Player Modal Component
 *
 * A modal dialog that displays a video/audio player for streaming torrent files.
 * Shows the file title and provides playback controls.
 *
 * STREAMING MODES:
 * 1. Client-side WebTorrent (P2P): For native-compatible formats (mp4, webm, mp3, etc.)
 *    - Streams directly from peers in the browser
 *    - Reduces server load and bandwidth
 *    - True P2P streaming
 *
 * 2. Server-side streaming: For formats requiring transcoding (mkv, flac, etc.)
 *    - Uses /api/stream endpoint
 *    - Server downloads from peers and transcodes via FFmpeg
 *    - Outputs browser-compatible format
 *
 * Pre-checks codec info before playback to determine if transcoding is needed.
 * Displays realtime swarm statistics (seeders/leechers).
 * Shows real-time connection status and health stats via persistent SSE.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import { VideoPlayer } from '@/components/video/video-player';
import { AudioPlayer } from '@/components/audio/audio-player';
import { FileFavoriteButton } from '@/components/ui/file-favorite-button';
import { RefreshIcon } from '@/components/ui/icons';
import { getMediaCategory } from '@/lib/utils';
import { formatProgressTime } from '@/lib/progress/progress';
import { useAnalytics, useWebTorrent, isNativeCompatible, useTvDetection } from '@/hooks';
import type { TorrentFile, FileProgress } from '@/types';

/**
 * Check if a string is a valid UUID v4
 * Used to determine if a file ID is from bt_torrent_files (valid UUID)
 * or a synthetic DHT file ID (infohash-index format)
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Codec information from the API
 */
interface CodecInfo {
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
  needsTranscoding: boolean | null;
  cached: boolean;
  detectedAt?: string;
  duration?: number;
  bitRate?: number;
  resolution?: string;
}

/**
 * Swarm statistics from the API
 */
interface SwarmStats {
  seeders: number | null;
  leechers: number | null;
  fetchedAt: string;
  trackersResponded: number;
  trackersQueried: number;
}

/**
 * Connection status event from SSE endpoint
 */
interface ConnectionStatus {
  stage: 'initializing' | 'connecting' | 'searching_peers' | 'downloading_metadata' | 'buffering' | 'ready' | 'error';
  message: string;
  numPeers: number;
  /** Overall torrent progress (0-1) */
  progress: number;
  /** File-specific progress (0-1) - more accurate for streaming individual files */
  fileProgress?: number;
  downloadSpeed: number;
  uploadSpeed: number;
  /** Whether the torrent metadata is ready */
  ready: boolean;
  /** Whether the file has enough data buffered for streaming (2MB for audio, 10MB for video) */
  fileReady?: boolean;
  fileIndex?: number;
  timestamp: number;
}

// Transcoding decisions are now made by codec detection (server-side FFprobe),
// not by file extension. This allows MKV/AVI with browser-compatible codecs
// (h264+AAC) to play natively without unnecessary transcoding.

/**
 * Error messages that indicate codec issues requiring transcoding
 * These are common error patterns from browsers when they can't decode the video
 */
const CODEC_ERROR_PATTERNS = [
  'MEDIA_ERR_SRC_NOT_SUPPORTED',
  'MEDIA_ERR_DECODE',
  'NotSupportedError',
  'The media could not be loaded',
  'No compatible source was found',
  'Failed to load because no supported source was found',
  'codec',
  'format',
  'unsupported',
  'decode',
];

/**
 * Check if an error message indicates a codec/format issue
 */
function isCodecError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase();
  return CODEC_ERROR_PATTERNS.some(pattern =>
    lowerMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Swarm stats polling interval in milliseconds (60 seconds)
 * Increased from 30s to reduce CPU/network pressure on low-resource devices (Fire Stick)
 */
const SWARM_STATS_POLL_INTERVAL = 60000;

/**
 * WebSocket trackers for browser WebTorrent
 * These are required for peer discovery in the browser since UDP trackers don't work
 */
const WEBTORRENT_TRACKERS = [
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

/**
 * Extract track info from filename
 * Attempts to parse common naming patterns like:
 * - "01 - Track Name.mp3"
 * - "Artist - Track Name.mp3"
 * - "01. Track Name.mp3"
 */
function extractTrackInfo(filename: string): { title: string; trackNumber?: number } {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
  
  // Try to extract track number from start
  const trackNumMatch = nameWithoutExt.match(/^(\d{1,3})[\s._-]+(.+)$/);
  if (trackNumMatch) {
    return {
      trackNumber: parseInt(trackNumMatch[1], 10),
      title: trackNumMatch[2].trim(),
    };
  }
  
  return { title: nameWithoutExt };
}

/**
 * Extract album name from file path
 * Assumes structure like: "Artist/Album/track.mp3" or "Album/track.mp3"
 */
function extractAlbumFromPath(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    // Return the parent folder name as album
    return parts[parts.length - 2];
  }
  return undefined;
}

/**
 * Extract artist name from file path
 * Assumes structure like: "Artist/Album/track.mp3"
 */
function extractArtistFromPath(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 3) {
    // Return the grandparent folder name as artist
    return parts[parts.length - 3];
  }
  return undefined;
}

/**
 * Props for the MediaPlayerModal component
 */
export interface MediaPlayerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** The file to play */
  file: TorrentFile | null;
  /** The infohash of the torrent */
  infohash: string;
  /** Optional torrent name for context */
  torrentName?: string;
  /** Optional artist name for the track */
  artist?: string;
  /** Optional album name for the track */
  album?: string;
  /** Optional cover art URL */
  coverArt?: string;
  /** Existing progress for this file (for resume prompt) */
  existingProgress?: FileProgress;
  /** Callback to save progress - called every 15 seconds, on pause, and on close */
  onProgressSave?: (fileId: string, currentTimeSeconds: number, durationSeconds: number) => void;
}

/**
 * Media Player Modal Component
 *
 * Displays a modal with the appropriate player based on media type.
 * Supports displaying artist, album, song title, and cover art.
 * Integrates with Media Session API for iOS lock screen and CarPlay.
 *
 * Uses client-side WebTorrent P2P streaming for native-compatible formats,
 * and server-side streaming with transcoding for non-native formats.
 */
export function MediaPlayerModal({
  isOpen,
  onClose,
  file,
  infohash,
  torrentName,
  artist: artistProp,
  album: albumProp,
  coverArt,
  existingProgress,
  onProgressSave,
}: MediaPlayerModalProps): React.ReactElement | null {
  const { trackPlayback } = useAnalytics();
  const { isTv } = useTvDetection();

  // Client-side WebTorrent hook for P2P streaming of native formats
  const webTorrent = useWebTorrent();

  // Ref for video container to enable fullscreen on TV
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  /** Whether we're using client-side P2P streaming */
  const [isP2PStreaming, setIsP2PStreaming] = useState(false);
  const [swarmStats, setSwarmStats] = useState<SwarmStats | null>(null);
  const [isLoadingSwarm, setIsLoadingSwarm] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [userClickedPlay, setUserClickedPlay] = useState(false);

  // Resume dialog state
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumeTime, setResumeTime] = useState<number | null>(null);

  // Progress saving refs
  const PROGRESS_SAVE_INTERVAL = 15000; // 15 seconds
  const lastSavedTimeRef = useRef<number>(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Track if we've already tried transcoding to avoid infinite retry loops */
  const [hasTriedTranscoding, setHasTriedTranscoding] = useState(false);
  /** Track if we're retrying with transcoding after a codec error */
  const [isRetryingWithTranscode, setIsRetryingWithTranscode] = useState(false);
  /** Counter to force player reload on retry */
  const [retryCount, setRetryCount] = useState(0);
  /** Codec info from pre-check */
  const [codecInfo, setCodecInfo] = useState<CodecInfo | null>(null);
  /** Whether we're currently checking codec info */
  const [isCheckingCodec, setIsCheckingCodec] = useState(false);
  /** Whether codec check has completed (success or failure) */
  const [codecCheckComplete, setCodecCheckComplete] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch swarm stats from the API
  const fetchSwarmStats = useCallback(async () => {
    if (!infohash) return;

    setIsLoadingSwarm(true);
    try {
      const response = await fetch(`/api/torrents/${infohash}/swarm`);
      if (response.ok) {
        const data = await response.json() as SwarmStats;
        setSwarmStats(data);
        console.log('[MediaPlayerModal] Swarm stats updated:', data);
      } else {
        console.warn('[MediaPlayerModal] Failed to fetch swarm stats:', response.status);
      }
    } catch (err) {
      console.error('[MediaPlayerModal] Error fetching swarm stats:', err);
    } finally {
      setIsLoadingSwarm(false);
    }
  }, [infohash]);

  // Start/stop polling for swarm stats when modal opens/closes
  useEffect(() => {
    if (isOpen && infohash) {
      // Fetch immediately
      void fetchSwarmStats();

      // Set up polling
      pollIntervalRef.current = setInterval(() => {
        void fetchSwarmStats();
      }, SWARM_STATS_POLL_INTERVAL);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    } else {
      // Clear stats when modal closes
      setSwarmStats(null);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [isOpen, infohash, fetchSwarmStats]);

  // Pre-check codec info when modal opens for video files
  // This allows us to determine if transcoding is needed BEFORE attempting playback
  // IMPORTANT: Only check CACHED codec info - do NOT trigger detection here
  // Detection requires downloading data from the torrent which can be slow
  // If codec info is not cached, let the player try to play and handle errors at runtime
  useEffect(() => {
    if (!isOpen || !infohash || !file) {
      setCodecInfo(null);
      setCodecCheckComplete(false);
      return;
    }

    const mediaCategory = getMediaCategory(file.name);
    
    // Only pre-check codec for video files (audio usually doesn't need transcoding)
    if (mediaCategory !== 'video') {
      setCodecCheckComplete(true);
      return;
    }

    // Check CACHED codec info for all video files
    // Codec detection determines if transcoding is needed based on actual codecs,
    // not just file extension (e.g., MKV with h264+AAC can play natively)
    // Do NOT trigger detection here - it requires downloading data which can be slow
    // If not cached, let the player try to play and handle codec errors at runtime
    const checkCachedCodecInfo = async (): Promise<void> => {
      setIsCheckingCodec(true);
      try {
        // Only try to get CACHED codec info - do not trigger detection
        const response = await fetch(`/api/codec-info/${infohash}?fileIndex=${file.fileIndex}`);
        if (response.ok) {
          const data = await response.json() as CodecInfo;
          console.log('[MediaPlayerModal] Codec info retrieved:', data);
          setCodecInfo(data);
          
          // If codec info is cached, use it
          // If not cached, proceed without it - player will handle codec errors at runtime
          if (!data.cached) {
            console.log('[MediaPlayerModal] Codec info not cached, will detect at runtime if needed');
          }
        }
      } catch (err) {
        console.error('[MediaPlayerModal] Failed to check codec info:', err);
        // On error, proceed without codec info - will fall back to runtime detection
      } finally {
        setIsCheckingCodec(false);
        setCodecCheckComplete(true);
      }
    };

    void checkCachedCodecInfo();
  }, [isOpen, infohash, file]);

  // Extract stable references from webTorrent hook to avoid infinite loops
  // The webTorrent object changes on every render, but these functions are stable
  const { startStream: webTorrentStartStream, stopStream: webTorrentStopStream } = webTorrent;

  // Build stream URL when file changes and codec check is complete
  // For native-compatible formats: use client-side WebTorrent P2P streaming
  // For non-native formats: use server-side streaming with transcoding
  // retryCount is included to force URL rebuild on manual retry
  useEffect(() => {
    if (file && infohash && codecCheckComplete) {
      // Determine if transcoding is needed based on codec detection (not file extension):
      // 1. If codec info says transcoding is needed (HEVC, non-browser codecs, etc.)
      // 2. If we're retrying after a codec error at runtime
      const codecNeedsTranscode = codecInfo?.needsTranscoding === true;
      const requiresTranscoding = isRetryingWithTranscode || codecNeedsTranscode;
      
      // P2P streaming DISABLED - always use server-side streaming
      //
      // Browser WebTorrent can ONLY connect to other WebRTC peers, not traditional
      // BitTorrent peers (TCP/UDP). Most torrent swarms have traditional peers,
      // so browser P2P rarely finds peers and the 10-second timeout degrades UX.
      //
      // Server-side streaming uses node-datachannel to connect to ALL peers:
      // - Traditional BitTorrent peers (TCP/UDP) - most of the swarm
      // - WebRTC peers (browsers)
      //
      // Always use server-side streaming for reliability.
      const canUseP2P = false;
      
      setIsTranscoding(requiresTranscoding);
      setIsP2PStreaming(canUseP2P);

      console.log('[MediaPlayerModal] Determining streaming mode:', {
        infohash,
        fileIndex: file.fileIndex,
        fileName: file.name,
        codecNeedsTranscode,
        container: codecInfo?.container,
        isNativeCompatible: isNativeCompatible(file.name),
        requiresTranscoding,
        isRetryingWithTranscode,
        retryCount,
        note: 'Server streaming - P2P disabled (browsers only see WebRTC peers, not traditional peers)',
      });

      if (canUseP2P) {
        // Use client-side WebTorrent P2P streaming for native-compatible formats
        // The server has WebRTC support via node-datachannel, so browsers can connect
        console.log('[MediaPlayerModal] Starting P2P streaming');
        
        // Build magnet URI with WebSocket trackers for browser peer discovery
        const magnetUri = `magnet:?xt=urn:btih:${infohash}&${WEBTORRENT_TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&')}`;
        
        // Start P2P streaming - this will set webTorrent.streamUrl when ready
        webTorrentStartStream({
          magnetUri,
          fileIndex: file.fileIndex,
          fileName: file.name,
        });
        
        // Don't set streamUrl here - it will be set by the useEffect that watches webTorrent.streamUrl
        // Clear any previous server-side URL
        setStreamUrl(null);
      } else {
        // Use server-side streaming for formats requiring transcoding
        // Server can connect to traditional BitTorrent peers using TCP/UDP
        console.log('[MediaPlayerModal] Using server-side streaming');
        
        // Stop any active P2P stream (in case it was started before)
        webTorrentStopStream();
        
        // Build server-side stream URL
        // Use demuxer param from codec detection when available (precise),
        // fall back to transcode=auto for retry path without codec info
        let url = `/api/stream?infohash=${infohash}&fileIndex=${file.fileIndex}`;
        if (requiresTranscoding) {
          if (codecInfo?.container) {
            // Use container-derived demuxer for precise transcoding
            url += `&demuxer=${encodeURIComponent(codecInfo.container.split(',')[0])}`;
          } else {
            // Fallback: let server auto-detect from extension
            url += '&transcode=auto';
          }
        }
        if (retryCount > 0) {
          url += `&_retry=${retryCount}`;
        }

        console.log('[MediaPlayerModal] Server stream URL:', url);
        setStreamUrl(url);
      }
      
      // Always clear error when starting a new stream
      setError(null);
      setIsPlayerReady(false);
    } else if (!file || !infohash) {
      // Cleanup when no file
      webTorrentStopStream();
      setStreamUrl(null);
      setIsTranscoding(false);
      setIsP2PStreaming(false);
      setIsPlayerReady(false);
    }
    // Don't clear stream URL while waiting for codec check - keep previous state
    // Note: webTorrentStartStream and webTorrentStopStream are stable references from useCallback
  }, [file, infohash, isRetryingWithTranscode, retryCount, codecCheckComplete, codecInfo, webTorrentStartStream, webTorrentStopStream]);
  
  // Update stream URL from WebTorrent when P2P streaming has a URL available
  // The streamUrl is available as soon as the torrent is ready (metadata received)
  // We should start playing immediately - the service worker will serve data progressively
  useEffect(() => {
    if (isP2PStreaming && webTorrent.streamUrl) {
      console.log('[MediaPlayerModal] P2P stream URL available:', {
        streamUrl: webTorrent.streamUrl,
        status: webTorrent.status,
        numPeers: webTorrent.numPeers,
        progress: webTorrent.progress,
      });
      setStreamUrl(webTorrent.streamUrl);
    }
  }, [isP2PStreaming, webTorrent.streamUrl, webTorrent.status, webTorrent.numPeers, webTorrent.progress]);
  
  // Handle WebTorrent errors
  useEffect(() => {
    if (isP2PStreaming && webTorrent.status === 'error' && webTorrent.error) {
      console.error('[MediaPlayerModal] P2P streaming error:', webTorrent.error);
      setError(webTorrent.error);
    }
  }, [isP2PStreaming, webTorrent.status, webTorrent.error]);

  // Handle 'no-peers' status - fall back to server streaming
  // This happens when no WebRTC peers are found after the peer discovery timeout
  useEffect(() => {
    if (isP2PStreaming && webTorrent.status === 'no-peers' && file && infohash) {
      console.log('[MediaPlayerModal] No WebRTC peers found, falling back to server streaming');
      
      // Stop P2P streaming
      webTorrentStopStream();
      
      // CRITICAL: Clear the stream URL FIRST to ensure the player unmounts cleanly
      // This prevents the "Try again" crash that occurs when the player tries to
      // play from a stale P2P stream URL during the transition
      setStreamUrl(null);
      
      // Reset player state to ensure clean transition
      setIsPlayerReady(false);
      setUserClickedPlay(false);
      
      // Switch to server-side streaming
      setIsP2PStreaming(false);
      
      // Increment retry count to force player remount with new URL
      // This ensures the video element is recreated with the server stream URL
      setRetryCount(prev => prev + 1);
      
      // Build server-side stream URL (no transcoding needed since format is native-compatible)
      // Note: The URL will be set by the main useEffect that watches codecCheckComplete
      // because we've changed isP2PStreaming to false
      console.log('[MediaPlayerModal] Triggering fallback to server streaming');
    }
  }, [isP2PStreaming, webTorrent.status, file, infohash, webTorrentStopStream]);

  // Handle player ready
  const handlePlayerReady = useCallback(() => {
    console.log('[MediaPlayerModal] Player ready');
    setIsPlayerReady(true);

    // Track playback start
    if (file) {
      const mediaType = getMediaCategory(file.name);
      trackPlayback({
        action: 'start',
        media_type: mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio' : 'video',
        title: file.name,
        infohash,
      });
    }
  }, [file, infohash, trackPlayback]);

  // Handle video play event - request fullscreen on TV
  const handleVideoPlay = useCallback(() => {
    console.log('[MediaPlayerModal] Video play event, isTv:', isTv);

    // On TV screens, request fullscreen when video starts playing
    if (isTv && videoContainerRef.current) {
      const container = videoContainerRef.current;

      // Find the video element inside the container
      const videoElement = container.querySelector('video');

      // Try to request fullscreen on the video element first, then container
      const elementToFullscreen = videoElement ?? container;

      if (elementToFullscreen.requestFullscreen) {
        elementToFullscreen.requestFullscreen().catch((err: Error) => {
          console.warn('[MediaPlayerModal] Fullscreen request failed:', err.message);
        });
      } else if ((elementToFullscreen as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
        // iOS Safari uses webkitEnterFullscreen on video elements
        (elementToFullscreen as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
      }
    }
  }, [isTv]);

  // Handle player error
  // If it's a codec error and we haven't tried transcoding yet, retry with transcoding
  const handlePlayerError = useCallback((err: Error) => {
    console.error('[MediaPlayerModal] Player error:', err);
    
    // Check if this is a codec/format error and we haven't tried transcoding yet
    if (!hasTriedTranscoding && !isTranscoding && isCodecError(err.message)) {
      console.log('[MediaPlayerModal] Detected codec error, retrying with transcoding...');
      setHasTriedTranscoding(true);
      setIsRetryingWithTranscode(true);
      // Don't set error - we want the player to keep rendering while we switch to transcoding
      // The useEffect will rebuild the URL with transcode=auto
      setIsPlayerReady(false);
      return;
    }
    
    // Track playback error
    if (file) {
      const mediaType = getMediaCategory(file.name);
      trackPlayback({
        action: 'error',
        media_type: mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio' : 'video',
        title: file.name,
        infohash,
      });
    }
    
    // If we already tried transcoding or it's not a codec error, show the error
    setError(err.message);
    setIsPlayerReady(true); // Stop showing loading on error
  }, [hasTriedTranscoding, isTranscoding, file, infohash, trackPlayback]);

  // Handle close and cleanup
  const handleClose = useCallback(() => {
    // Stop P2P streaming
    webTorrentStopStream();
    
    setStreamUrl(null);
    setError(null);
    setIsPlayerReady(false);
    setIsP2PStreaming(false);
    setSwarmStats(null);
    setConnectionStatus(null);
    setUserClickedPlay(false);
    // Reset transcoding retry state
    setHasTriedTranscoding(false);
    setIsRetryingWithTranscode(false);
    // Reset codec check state
    setCodecInfo(null);
    setIsCheckingCodec(false);
    setCodecCheckComplete(false);
    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    onClose();
  }, [onClose, webTorrentStopStream]);

  // Reset transcoding retry state when file changes
  useEffect(() => {
    setHasTriedTranscoding(false);
    setIsRetryingWithTranscode(false);
  }, [file?.fileIndex, infohash]);

  // Show resume dialog when opening a file with progress (5-95%)
  useEffect(() => {
    if (isOpen && existingProgress && existingProgress.currentTimeSeconds !== undefined) {
      const percentage = existingProgress.percentage;
      if (percentage > 5 && percentage < 95) {
        setResumeTime(existingProgress.currentTimeSeconds);
        setShowResumeDialog(true);
      } else {
        setShowResumeDialog(false);
        setResumeTime(null);
      }
    } else {
      setShowResumeDialog(false);
      setResumeTime(null);
    }
  }, [isOpen, existingProgress]);

  // Save progress function
  const saveProgress = useCallback((timeSeconds: number, durationSeconds: number) => {
    if (!file || !onProgressSave || !file.id) return;

    // Don't save if time hasn't changed significantly (more than 2 seconds)
    if (Math.abs(timeSeconds - lastSavedTimeRef.current) < 2) return;

    console.log('[MediaPlayerModal] Saving progress:', { fileId: file.id, timeSeconds, durationSeconds });
    lastSavedTimeRef.current = timeSeconds;
    onProgressSave(file.id, Math.floor(timeSeconds), Math.floor(durationSeconds));
  }, [file, onProgressSave]);

  // Get current time and duration from player
  const getCurrentPlaybackState = useCallback((): { currentTime: number; duration: number } | null => {
    // Try video element first
    const video = videoRef.current ?? document.querySelector('video');
    if (video && !isNaN(video.currentTime) && !isNaN(video.duration) && video.duration > 0) {
      return { currentTime: video.currentTime, duration: video.duration };
    }

    // Try audio element
    const audio = audioRef.current ?? document.querySelector('audio');
    if (audio && !isNaN(audio.currentTime) && !isNaN(audio.duration) && audio.duration > 0) {
      return { currentTime: audio.currentTime, duration: audio.duration };
    }

    return null;
  }, []);

  // Set up periodic progress saving interval
  useEffect(() => {
    if (isPlayerReady && !error && onProgressSave) {
      progressIntervalRef.current = setInterval(() => {
        const state = getCurrentPlaybackState();
        if (state) {
          saveProgress(state.currentTime, state.duration);
        }
      }, PROGRESS_SAVE_INTERVAL);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isPlayerReady, error, onProgressSave, saveProgress, getCurrentPlaybackState, PROGRESS_SAVE_INTERVAL]);

  // Save progress when modal closes
  const handleCloseWithProgress = useCallback(() => {
    // Save current progress before closing
    if (onProgressSave) {
      const state = getCurrentPlaybackState();
      if (state) {
        console.log('[MediaPlayerModal] Saving progress on close');
        onProgressSave(file?.id ?? '', Math.floor(state.currentTime), Math.floor(state.duration));
      }
    }

    // Clear progress interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Reset resume dialog state
    setShowResumeDialog(false);
    setResumeTime(null);
    lastSavedTimeRef.current = 0;

    // Call original close handler
    handleClose();
  }, [onProgressSave, getCurrentPlaybackState, file?.id, handleClose]);

  // Handle resume button click - seek to saved position
  const handleResume = useCallback(() => {
    setShowResumeDialog(false);
    if (resumeTime !== null) {
      // Wait a bit for the player to be ready, then seek
      setTimeout(() => {
        const video = videoRef.current ?? document.querySelector('video');
        const audio = audioRef.current ?? document.querySelector('audio');
        const player = video ?? audio;
        if (player) {
          console.log('[MediaPlayerModal] Resuming from:', resumeTime);
          player.currentTime = resumeTime;
        }
      }, 500);
    }
  }, [resumeTime]);

  // Handle start over button click
  const handleStartOver = useCallback(() => {
    setShowResumeDialog(false);
    setResumeTime(null);
    // Player starts from beginning by default
  }, []);

  // Handle manual play button click (for browsers that block autoplay)
  // This hides the overlay and lets the user interact with the player's native controls
  const handleManualPlay = useCallback(() => {
    console.log('[MediaPlayerModal] User clicked play button');
    setUserClickedPlay(true);
    // The underlying player has autoplay enabled, so it should start playing
    // If autoplay is still blocked, the user can use the player's native controls
  }, []);

  // Handle retry button click - clears error and forces player reload
  const handleRetry = useCallback(() => {
    console.log('[MediaPlayerModal] User clicked retry button');
    setError(null);
    setIsPlayerReady(false);
    setUserClickedPlay(false);
    // Increment retry count to force URL rebuild and player remount
    setRetryCount(prev => prev + 1);
  }, []);

  // Handle refresh button click - restarts the stream completely
  const handleRefresh = useCallback(() => {
    console.log('[MediaPlayerModal] User clicked refresh button');
    // Reset player state
    setIsPlayerReady(false);
    setError(null);
    setStreamUrl(null);
    setConnectionStatus(null);
    setCodecCheckComplete(false);

    // Close existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Increment retryCount to force the stream URL useEffect to re-run
    // This will rebuild the URL and reconnect to the stream
    setRetryCount((prev) => prev + 1);
  }, []);

  // Subscribe to connection status SSE - persistent mode keeps streaming after ready
  // Use file.fileIndex as dependency instead of file object to avoid unnecessary reconnections
  // when the file object reference changes but the actual file is the same
  const fileIndex = file?.fileIndex;
  useEffect(() => {
    if (!isOpen || !infohash || fileIndex === undefined) {
      // Close existing connection when modal closes
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionStatus(null);
      return;
    }

    // Create SSE connection for connection status with persistent=true
    // This keeps the stream open after ready to show ongoing health stats
    const url = `/api/stream/status?infohash=${infohash}&fileIndex=${fileIndex}&persistent=true`;
    console.log('[MediaPlayerModal] Connecting to persistent SSE:', url);
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const status = JSON.parse(event.data as string) as ConnectionStatus;
        setConnectionStatus(status);
        console.log('[MediaPlayerModal] Connection status:', status);
      } catch (err) {
        console.error('[MediaPlayerModal] Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[MediaPlayerModal] SSE error:', err);
      // Don't close on error - let it reconnect automatically
    };

    return () => {
      console.log('[MediaPlayerModal] Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [isOpen, infohash, fileIndex]);

  if (!file) return null;

  const mediaCategory = getMediaCategory(file.name);
  
  // Extract track info from filename
  const trackInfo = extractTrackInfo(file.name);
  
  // Determine artist: use prop, or extract from path
  const artist = artistProp ?? extractArtistFromPath(file.path);
  
  // Determine album: use prop, or extract from path, or use torrent name
  const album = albumProp ?? extractAlbumFromPath(file.path) ?? torrentName;
  
  // Use extracted title for display
  const displayTitle = trackInfo.title;
  // Use torrentName (which is clean_title) for modal title, fallback to file name
  const modalTitle = torrentName ?? file.name;
  
  const isLoading = !isPlayerReady && !error;

  // For P2P streaming, use WebTorrent status; for server-side, use SSE connection status
  // Stream is ready when the stream URL is available - the service worker handles progressive streaming
  // We don't need to wait for a specific buffer amount - the player will buffer as needed
  const isP2PReady = isP2PStreaming && webTorrent.streamUrl !== null;
  const isServerStreamReady = connectionStatus?.fileReady ?? connectionStatus?.ready ?? false;
  const isStreamReady = isP2PStreaming ? isP2PReady : isServerStreamReady;
  // Show play button when stream is ready but user hasn't clicked play yet
  // On TV screens, skip the play button overlay - let autoplay handle it
  const showPlayButton = !isTv && isStreamReady && !userClickedPlay && !isPlayerReady;
  // Show loading spinner when stream is not ready yet (for P2P, check WebTorrent status)
  // WebTorrent status: 'idle' | 'loading' | 'buffering' | 'ready' | 'no-peers' | 'error'
  // Also show loading when falling back from P2P to server streaming ('no-peers' status)
  const showLoadingSpinner = isP2PStreaming
    ? (webTorrent.status === 'loading' || webTorrent.status === 'buffering' || webTorrent.status === 'no-peers') && !error
    : !isServerStreamReady && !error;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseWithProgress}
      title={modalTitle}
      size="3xl"
      className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-3xl"
    >
      <div className="space-y-2 sm:space-y-3">
        {/* Metadata Header - Artist → Album → Song with Cover Art - compact for TV */}
        <div className="flex items-start gap-2 sm:gap-3 md:gap-4" data-testid="metadata-header">
          {/* Cover Art - smaller on TV/mobile */}
          {coverArt ? (
            <div className="h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 flex-shrink-0 overflow-hidden rounded-md sm:rounded-lg shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverArt}
                alt={album ?? displayTitle}
                className="h-full w-full object-cover"
                data-testid="cover-art-image"
              />
            </div>
          ) : (
            <div
              className="flex h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 flex-shrink-0 items-center justify-center rounded-md sm:rounded-lg bg-bg-tertiary shadow-md"
              data-testid="cover-art-placeholder"
            >
              <svg
                className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 text-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
          )}
          
          {/* Track Info - compact text sizes */}
          <div className="min-w-0 flex-1">
            {/* Artist → Album breadcrumb */}
            {(artist || album) ? (
              <p className="text-xs sm:text-sm text-text-secondary truncate">
                {artist}
                {artist && album ? (
                  <span className="mx-1 sm:mx-1.5 text-text-muted">→</span>
                ) : null}
                {album}
              </p>
            ) : null}
            
            {/* Song Title */}
            <h3 className="mt-0.5 sm:mt-1 text-sm sm:text-base md:text-lg font-semibold text-text-primary truncate">
              {displayTitle}
            </h3>
            
            {/* Track Number if available */}
            {trackInfo.trackNumber ? (
              <p className="mt-0.5 text-[10px] sm:text-xs text-text-muted">
                Track {trackInfo.trackNumber}
              </p>
            ) : null}
          </div>

          {/* Favorite Button - only show for user torrents with valid file IDs */}
          {file.id && isValidUUID(file.id) ? <FileFavoriteButton
              fileId={file.id}
              size="md"
              className="flex-shrink-0 hover:bg-bg-tertiary rounded-full"
            /> : null}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors flex-shrink-0"
            aria-label="Refresh stream"
            title="Refresh stream"
          >
            <RefreshIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Swarm Stats Row - compact for TV */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Torrent Name - hidden on very small screens */}
          {torrentName ? <p className="hidden sm:block text-xs sm:text-sm text-text-muted truncate flex-1">From: {torrentName}</p> : null}

          {/* Swarm Stats Badge - always visible, compact */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {isLoadingSwarm && !swarmStats ? (
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-text-muted">
                <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                <span className="hidden sm:inline">Loading swarm...</span>
              </div>
            ) : swarmStats ? (
              <>
                {/* Seeders */}
                <div className="flex items-center gap-1" title="Seeders (peers with complete file)">
                  <svg
                    className="h-3 w-3 sm:h-4 sm:w-4 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-green-500">
                    {swarmStats.seeders ?? '?'}
                  </span>
                </div>

                {/* Leechers */}
                <div className="flex items-center gap-1" title="Leechers (peers downloading)">
                  <svg
                    className="h-3 w-3 sm:h-4 sm:w-4 text-orange-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-orange-500">
                    {swarmStats.leechers ?? '?'}
                  </span>
                </div>

                {/* Refresh indicator */}
                {isLoadingSwarm ? <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-spin rounded-full border-2 border-text-muted border-t-transparent" /> : null}
              </>
            ) : null}
          </div>
        </div>

        {/* Codec Check Notice - compact for TV */}
        {isCheckingCodec && !error ? <div className="rounded-md sm:rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="h-3 w-3 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent flex-shrink-0" />
              <span className="text-xs sm:text-sm text-blue-500">
                Checking codec...
              </span>
            </div>
          </div> : null}

        {/* Codec Info Display - compact for TV */}
        {codecInfo && !isCheckingCodec && !error ? <div className={`rounded-md sm:rounded-lg border p-2 sm:p-3 ${
          codecInfo.needsTranscoding
            ? 'border-orange-500/30 bg-orange-500/10'
            : 'border-green-500/30 bg-green-500/10'
        }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <svg
                  className={`h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 ${codecInfo.needsTranscoding ? 'text-orange-500' : 'text-green-500'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className={`text-xs sm:text-sm ${codecInfo.needsTranscoding ? 'text-orange-500' : 'text-green-500'}`}>
                  {codecInfo.needsTranscoding ? 'Transcoding' : 'Compatible'}
                </span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-text-muted">
                {codecInfo.videoCodec ? <span className="rounded bg-bg-tertiary px-1 sm:px-1.5 py-0.5">{codecInfo.videoCodec}</span> : null}
                {codecInfo.audioCodec ? <span className="hidden sm:inline rounded bg-bg-tertiary px-1.5 py-0.5">{codecInfo.audioCodec}</span> : null}
                {codecInfo.resolution ? <span className="rounded bg-bg-tertiary px-1 sm:px-1.5 py-0.5">{codecInfo.resolution}</span> : null}
              </div>
            </div>
          </div> : null}

        {/* Transcoding Notice - compact for TV */}
        {isTranscoding && !error ? <div className="rounded-md sm:rounded-lg border border-accent-primary/30 bg-accent-primary/10 p-2 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isRetryingWithTranscode && isLoading ? (
                <div className="h-3 w-3 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent flex-shrink-0" />
              ) : (
                <svg
                  className="h-3 w-3 sm:h-4 sm:w-4 text-accent-primary flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              )}
              <span className="text-xs sm:text-sm text-accent-primary truncate">
                {isRetryingWithTranscode && isLoading
                  ? 'Switching to transcoding...'
                  : isLoading
                    ? 'Transcoding...'
                    : 'Live transcoding'}
              </span>
            </div>
          </div> : null}

        {/* P2P Streaming Notice - compact for TV */}
        {isP2PStreaming && !error ? <div className="rounded-md sm:rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 sm:p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {webTorrent.status === 'loading' || webTorrent.status === 'buffering' || webTorrent.status === 'no-peers' ? (
                  <div className="h-3 w-3 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent flex-shrink-0" />
                ) : (
                  <svg
                    className="h-3 w-3 sm:h-4 sm:w-4 text-cyan-500 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                    />
                  </svg>
                )}
                <span className="text-xs sm:text-sm text-cyan-500 truncate">
                  {webTorrent.status === 'loading'
                    ? 'Connecting to peers...'
                    : webTorrent.status === 'buffering'
                      ? 'Buffering from peers...'
                      : webTorrent.status === 'no-peers'
                        ? 'No peers found, switching to server...'
                        : 'P2P Streaming'}
                </span>
              </div>
              {/* P2P Stats */}
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-text-muted">
                {webTorrent.numPeers > 0 && (
                  <span className="flex items-center gap-0.5 text-cyan-500" title="Connected peers">
                    <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                    </svg>
                    {webTorrent.numPeers}
                  </span>
                )}
                {webTorrent.downloadSpeed > 0 && (
                  <span className="flex items-center gap-0.5 text-green-500" title="Download speed">
                    <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {formatSpeedCompact(webTorrent.downloadSpeed)}
                  </span>
                )}
                {webTorrent.progress > 0 && webTorrent.progress < 1 && (
                  <span className="text-cyan-500">
                    {(webTorrent.progress * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            {/* P2P Progress bar */}
            {webTorrent.progress > 0 && webTorrent.progress < 1 && (
              <div className="mt-1 sm:mt-1.5 h-0.5 sm:h-1 w-full overflow-hidden rounded-full bg-cyan-500/20">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${webTorrent.progress * 100}%` }}
                />
              </div>
            )}
          </div> : null}

        {/* Error State with Try Again button - compact for TV */}
        {error ? <div className="rounded-md sm:rounded-lg border border-error/50 bg-error/10 p-2 sm:p-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <svg
                className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-error"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm sm:text-base font-medium text-error">Playback Error</h4>
                <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-text-muted truncate">{error}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-2 sm:mt-3 inline-flex items-center gap-1.5 sm:gap-2 rounded-md sm:rounded-lg bg-accent-primary px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 focus:ring-2 focus:ring-accent-primary focus:outline-none"
                >
                  <svg
                    className="h-3 w-3 sm:h-4 sm:w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Retry
                </button>
              </div>
            </div>
          </div> : null}

        {/* Video Player - always render when we have a URL and it's video - compact for TV */}
        {streamUrl && mediaCategory === 'video' && !error ? <div
            ref={videoContainerRef}
            className="relative aspect-video w-full overflow-hidden rounded-md sm:rounded-lg bg-black"
          >
            {/* Loading spinner overlay - shown while stream is initializing */}
            {showLoadingSpinner ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
                <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                  <div className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 animate-spin rounded-full border-3 sm:border-4 border-accent-primary border-t-transparent" />
                  <span className="text-[10px] sm:text-xs md:text-sm text-white">
                    {isTranscoding ? 'Transcoding...' : 'Loading...'}
                  </span>
                </div>
              </div> : null}
            {/* Play button overlay - shown when stream is ready but autoplay blocked */}
            {showPlayButton ? <button
                type="button"
                onClick={handleManualPlay}
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 transition-colors hover:bg-black/50 focus:ring-2 focus:ring-accent-primary focus:outline-none"
                aria-label="Play video"
              >
                <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                  <div className="flex h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 items-center justify-center rounded-full bg-accent-primary text-white shadow-lg transition-transform hover:scale-110">
                    <svg className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 ml-0.5 sm:ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm md:text-base text-white font-medium">Play</span>
                </div>
              </button> : null}
            {/* Resume dialog overlay - shown when opening a file with existing progress */}
            {showResumeDialog && resumeTime !== null ? <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
                <div className="rounded-lg bg-bg-secondary p-4 sm:p-6 max-w-sm text-center mx-4">
                  <h3 className="text-base sm:text-lg font-medium text-text-primary mb-2">
                    Resume Playback?
                  </h3>
                  <p className="text-xs sm:text-sm text-text-muted mb-4">
                    You were at {formatProgressTime(resumeTime)} ({existingProgress?.percentage.toFixed(0)}%)
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      type="button"
                      onClick={handleStartOver}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm hover:bg-bg-hover transition-colors"
                    >
                      Start Over
                    </button>
                    <button
                      type="button"
                      onClick={handleResume}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-accent-primary text-white text-sm hover:bg-accent-primary/90 transition-colors"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </div> : null}
            <VideoPlayer
              key={`video-${retryCount}-${isTranscoding ? 'transcode' : 'native'}`}
              src={streamUrl}
              filename={file.name}
              onReady={handlePlayerReady}
              onPlay={handleVideoPlay}
              onError={handlePlayerError}
              showTranscodingNotice={false}
              autoplay
            />
          </div> : null}

        {/* Audio Player - always render when we have a URL and it's audio - compact for TV */}
        {streamUrl && mediaCategory === 'audio' && !error ? <div className="relative w-full">
            {/* Loading spinner overlay - shown while stream is initializing */}
            {showLoadingSpinner ? <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md sm:rounded-lg bg-bg-tertiary">
                <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                  <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-3 sm:border-4 border-accent-primary border-t-transparent" />
                  <span className="text-xs sm:text-sm text-text-muted">
                    {isTranscoding ? 'Transcoding...' : 'Loading...'}
                  </span>
                </div>
              </div> : null}
            {/* Play button overlay - shown when stream is ready but autoplay blocked */}
            {showPlayButton ? <button
                type="button"
                onClick={handleManualPlay}
                className="absolute inset-0 z-10 flex items-center justify-center rounded-md sm:rounded-lg bg-bg-tertiary/90 transition-colors hover:bg-bg-tertiary/80 focus:ring-2 focus:ring-accent-primary focus:outline-none"
                aria-label="Play audio"
              >
                <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                  <div className="flex h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 items-center justify-center rounded-full bg-accent-primary text-white shadow-lg transition-transform hover:scale-110">
                    <svg className="h-5 w-5 sm:h-7 sm:w-7 md:h-8 md:w-8 ml-0.5 sm:ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm text-text-primary font-medium">Play</span>
                </div>
              </button> : null}
            {/* Resume dialog overlay - shown when opening a file with existing progress */}
            {showResumeDialog && resumeTime !== null ? <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md sm:rounded-lg bg-bg-tertiary/95">
                <div className="rounded-lg bg-bg-secondary p-4 sm:p-6 max-w-sm text-center mx-4 shadow-lg">
                  <h3 className="text-base sm:text-lg font-medium text-text-primary mb-2">
                    Resume Playback?
                  </h3>
                  <p className="text-xs sm:text-sm text-text-muted mb-4">
                    You were at {formatProgressTime(resumeTime)} ({existingProgress?.percentage.toFixed(0)}%)
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      type="button"
                      onClick={handleStartOver}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm hover:bg-bg-hover transition-colors"
                    >
                      Start Over
                    </button>
                    <button
                      type="button"
                      onClick={handleResume}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-accent-primary text-white text-sm hover:bg-accent-primary/90 transition-colors"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </div> : null}
            <AudioPlayer
              key={`audio-${retryCount}-${isTranscoding ? 'transcode' : 'native'}`}
              src={streamUrl}
              filename={file.name}
              title={displayTitle}
              artist={artist}
              album={album}
              coverArt={coverArt}
              connectionStatus={connectionStatus}
              showConnectionStats={false}
              onReady={handlePlayerReady}
              onError={handlePlayerError}
              showTranscodingNotice={false}
              autoplay
            />
          </div> : null}

        {/* Unsupported Media Type - compact for TV */}
        {streamUrl && mediaCategory !== 'video' && mediaCategory !== 'audio' ? <div className="rounded-md sm:rounded-lg border border-border-subtle bg-bg-tertiary p-3 sm:p-6 text-center">
            <p className="text-xs sm:text-sm text-text-secondary">
              Cannot play {mediaCategory} in browser.
            </p>
            <a
              href={streamUrl}
              download={file.name}
              className="mt-2 sm:mt-4 inline-block rounded-md sm:rounded-lg bg-accent-primary px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-accent-primary/90 focus:ring-2 focus:ring-accent-primary focus:outline-none"
            >
              Download
            </a>
          </div> : null}

        {/* Connection Status Footer - compact for TV */}
        {/* Only show server-side connection status when NOT using P2P streaming */}
        {connectionStatus && !isP2PStreaming ? <div className={`rounded-md sm:rounded-lg border p-1.5 sm:p-2 md:p-3 ${
          isLoading
            ? 'border-border-subtle bg-bg-secondary'
            : 'border-green-500/30 bg-green-500/5'
        }`}>
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 md:gap-4">
              {/* Status message with spinner or health indicator */}
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                {isLoading ? (
                  <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-4 md:w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent flex-shrink-0" />
                ) : (
                  <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-4 md:w-4 rounded-full bg-green-500 animate-pulse flex-shrink-0" title="Stream active" />
                )}
                <span className="text-[10px] sm:text-xs md:text-sm text-text-secondary truncate">
                  {isLoading ? connectionStatus.message : 'Streaming'}
                </span>
              </div>
              
              {/* Stats - compact for TV */}
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 text-[10px] sm:text-xs text-text-muted flex-shrink-0">
                {/* Peers */}
                <span title="Connected peers" className="flex items-center gap-0.5 sm:gap-1">
                  <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                  <span className={connectionStatus.numPeers > 0 ? 'text-green-500' : 'text-orange-500'}>
                    {connectionStatus.numPeers}
                  </span>
                </span>
                
                {/* Progress - use fileProgress when available (more accurate for streaming) */}
                {(() => {
                  const displayProgress = connectionStatus.fileProgress ?? connectionStatus.progress;
                  return displayProgress < 1 && (
                    <span title="File download progress" className="flex items-center gap-0.5 sm:gap-1">
                      <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      <span className={displayProgress > 0.5 ? 'text-green-500' : 'text-yellow-500'}>
                        {(displayProgress * 100).toFixed(0)}%
                      </span>
                    </span>
                  );
                })()}
                
                {/* Download speed - compact for TV */}
                {connectionStatus.downloadSpeed > 0 && (
                  <span className="flex items-center gap-0.5 sm:gap-1 text-green-500" title="Download speed">
                    <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>{formatSpeedCompact(connectionStatus.downloadSpeed)}</span>
                  </span>
                )}
                
                {/* Upload speed - hidden on very small screens */}
                {connectionStatus.uploadSpeed > 0 && (
                  <span className="hidden sm:flex items-center gap-0.5 sm:gap-1 text-blue-500" title="Upload speed">
                    <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>{formatSpeedCompact(connectionStatus.uploadSpeed)}</span>
                  </span>
                )}
              </div>
            </div>
            
            {/* Progress bar - compact for TV */}
            {(() => {
              const displayProgress = connectionStatus.fileProgress ?? connectionStatus.progress;
              return displayProgress > 0 && displayProgress < 1 && (
                <div className="mt-1 sm:mt-1.5 md:mt-2 h-0.5 sm:h-1 w-full overflow-hidden rounded-full bg-bg-tertiary">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isLoading ? 'bg-accent-primary' : 'bg-green-500'
                    }`}
                    style={{ width: `${displayProgress * 100}%` }}
                  />
                </div>
              );
            })()}
          </div> : null}

        {/* Debug Info - hidden on small screens, compact on larger */}
        <details className="hidden sm:block">
          <summary className="cursor-pointer text-xs text-text-muted hover:text-text-secondary">
            Debug Info
          </summary>
          <div className="mt-2 rounded-lg bg-bg-tertiary p-2 sm:p-3 text-xs font-mono text-text-muted">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span>Type: {mediaCategory}</span>
              <span>Index: {file.fileIndex}</span>
              <span>Size: {formatBytes(file.size)}</span>
              {isTranscoding ? <span className="text-accent-primary">Transcoding</span> : null}
              {isP2PStreaming ? <span className="text-cyan-500">P2P</span> : <span className="text-text-muted">Server</span>}
              <span className={isPlayerReady ? 'text-green-500' : 'text-yellow-500'}>
                {isPlayerReady ? 'Ready' : 'Loading'}
              </span>
              {swarmStats ? <span className="text-text-secondary">
                  Trackers: {swarmStats.trackersResponded}/{swarmStats.trackersQueried}
                </span> : null}
            </div>
            {/* P2P WebTorrent Info */}
            {isP2PStreaming ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-text-secondary">P2P:</span>
                <span>Status: {webTorrent.status}</span>
                <span>Peers: {webTorrent.numPeers}</span>
                <span>Progress: {(webTorrent.progress * 100).toFixed(1)}%</span>
                <span>↓ {formatSpeed(webTorrent.downloadSpeed)}</span>
                <span>↑ {formatSpeed(webTorrent.uploadSpeed)}</span>
              </div> : null}
            {/* Codec Info */}
            {codecInfo ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-text-secondary">Codec:</span>
                {codecInfo.videoCodec ? <span>Video: {codecInfo.videoCodec}</span> : null}
                {codecInfo.audioCodec ? <span>Audio: {codecInfo.audioCodec}</span> : null}
                {codecInfo.container ? <span>Container: {codecInfo.container}</span> : null}
                {codecInfo.resolution ? <span>Res: {codecInfo.resolution}</span> : null}
                {codecInfo.bitRate ? <span>Bitrate: {formatBitrate(codecInfo.bitRate)}</span> : null}
                {codecInfo.duration ? <span>Duration: {formatDuration(codecInfo.duration)}</span> : null}
                <span className={codecInfo.needsTranscoding ? 'text-orange-500' : 'text-green-500'}>
                  {codecInfo.needsTranscoding ? 'Needs Transcode' : 'Native'}
                </span>
                {codecInfo.cached ? <span className="text-blue-500">Cached</span> : null}
              </div> : null}
            <div className="mt-1 break-all text-[10px]">
              <span className="text-text-secondary">Hash: </span>
              <span>{infohash}</span>
            </div>
          </div>
        </details>
      </div>
    </Modal>
  );
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format bytes per second to human readable speed
 */
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  }
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Format bytes per second to compact speed (for mobile)
 */
function formatSpeedCompact(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)}B`;
  }
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(0)}K`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)}M`;
}

/**
 * Format bitrate to human readable string
 */
function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond < 1000) {
    return `${bitsPerSecond.toFixed(0)} bps`;
  }
  if (bitsPerSecond < 1000000) {
    return `${(bitsPerSecond / 1000).toFixed(0)} Kbps`;
  }
  return `${(bitsPerSecond / 1000000).toFixed(1)} Mbps`;
}

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
