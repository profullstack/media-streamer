'use client';

/**
 * Media Player Modal Component
 *
 * A modal dialog that displays a video/audio player for streaming torrent files.
 * Shows the file title and provides playback controls.
 * Supports automatic transcoding for non-browser-supported formats.
 * Pre-checks codec info before playback to determine if transcoding is needed.
 * Displays realtime swarm statistics (seeders/leechers).
 * Shows real-time connection status and health stats via persistent SSE.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import { VideoPlayer } from '@/components/video/video-player';
import { AudioPlayer } from '@/components/audio/audio-player';
import { getMediaCategory } from '@/lib/utils';
import type { TorrentFile } from '@/types';

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

/**
 * Video formats that require transcoding for browser playback
 */
const VIDEO_TRANSCODE_FORMATS = new Set(['mkv', 'avi', 'wmv', 'flv', 'mov', 'ts']);

/**
 * Audio formats that require transcoding for browser playback
 *
 * Note: FLAC is NOT supported on iOS Safari, so we transcode it to MP3.
 * Desktop browsers (Chrome 56+, Firefox 51+, Safari 11+) support FLAC natively,
 * but for cross-platform compatibility we transcode all FLAC files.
 */
const AUDIO_TRANSCODE_FORMATS = new Set(['wma', 'aiff', 'ape', 'flac']);

/**
 * Check if a file needs transcoding based on its extension
 */
function needsTranscoding(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_TRANSCODE_FORMATS.has(ext) || AUDIO_TRANSCODE_FORMATS.has(ext);
}

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
 * Swarm stats polling interval in milliseconds (30 seconds)
 */
const SWARM_STATS_POLL_INTERVAL = 30000;

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
}

/**
 * Media Player Modal Component
 *
 * Displays a modal with the appropriate player based on media type.
 * Supports displaying artist, album, song title, and cover art.
 * Integrates with Media Session API for iOS lock screen and CarPlay.
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
}: MediaPlayerModalProps): React.ReactElement | null {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [swarmStats, setSwarmStats] = useState<SwarmStats | null>(null);
  const [isLoadingSwarm, setIsLoadingSwarm] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [userClickedPlay, setUserClickedPlay] = useState(false);
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

    // Check if format obviously needs transcoding based on extension
    // If so, skip the codec check and go straight to transcoding
    if (needsTranscoding(file.name)) {
      console.log('[MediaPlayerModal] Format requires transcoding based on extension:', file.name);
      setCodecCheckComplete(true);
      return;
    }

    // For formats that might need transcoding (like MP4 with HEVC), check CACHED codec info only
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

  // Build stream URL when file changes and codec check is complete
  // Add transcode=auto parameter for files that need transcoding
  // Also handles retry with transcoding after codec errors
  // retryCount is included to force URL rebuild on manual retry
  useEffect(() => {
    if (file && infohash && codecCheckComplete) {
      // Determine if transcoding is needed:
      // 1. If we're retrying after a codec error
      // 2. If the format requires it based on extension
      // 3. If codec info indicates transcoding is needed
      const formatNeedsTranscode = needsTranscoding(file.name);
      const codecNeedsTranscode = codecInfo?.needsTranscoding === true;
      const requiresTranscoding = isRetryingWithTranscode || formatNeedsTranscode || codecNeedsTranscode;
      setIsTranscoding(requiresTranscoding);

      // Add cache-busting parameter on retry to ensure fresh request
      let url = `/api/stream?infohash=${infohash}&fileIndex=${file.fileIndex}`;
      if (requiresTranscoding) {
        url += '&transcode=auto';
      }
      if (retryCount > 0) {
        url += `&_retry=${retryCount}`;
      }

      console.log('[MediaPlayerModal] Building stream URL:', {
        infohash,
        fileIndex: file.fileIndex,
        fileName: file.name,
        formatNeedsTranscode,
        codecNeedsTranscode,
        codecInfo: codecInfo ? {
          videoCodec: codecInfo.videoCodec,
          audioCodec: codecInfo.audioCodec,
          needsTranscoding: codecInfo.needsTranscoding,
          cached: codecInfo.cached,
        } : null,
        requiresTranscoding,
        isRetryingWithTranscode,
        retryCount,
        url,
      });

      setStreamUrl(url);
      // Always clear error when building a new URL (including when retrying with transcoding)
      setError(null);
      setIsPlayerReady(false);
    } else if (!file || !infohash) {
      setStreamUrl(null);
      setIsTranscoding(false);
      setIsPlayerReady(false);
    }
    // Don't clear stream URL while waiting for codec check - keep previous state
  }, [file, infohash, isRetryingWithTranscode, retryCount, codecCheckComplete, codecInfo]);

  // Handle player ready
  const handlePlayerReady = useCallback(() => {
    console.log('[MediaPlayerModal] Player ready');
    setIsPlayerReady(true);
  }, []);

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
    
    // If we already tried transcoding or it's not a codec error, show the error
    setError(err.message);
    setIsPlayerReady(true); // Stop showing loading on error
  }, [hasTriedTranscoding, isTranscoding]);

  // Handle close and cleanup
  const handleClose = useCallback(() => {
    setStreamUrl(null);
    setError(null);
    setIsPlayerReady(false);
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
  }, [onClose]);

  // Reset transcoding retry state when file changes
  useEffect(() => {
    setHasTriedTranscoding(false);
    setIsRetryingWithTranscode(false);
  }, [file?.fileIndex, infohash]);

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
  
  // Stream is ready when file has enough buffer for streaming (2MB for audio, 10MB for video)
  // Falls back to ready (metadata ready) if fileReady is not yet available
  const isStreamReady = connectionStatus?.fileReady ?? connectionStatus?.ready ?? false;
  // Show play button when stream is ready but user hasn't clicked play yet
  const showPlayButton = isStreamReady && !userClickedPlay && !isPlayerReady;
  // Show loading spinner when stream is not ready yet
  const showLoadingSpinner = !isStreamReady && !error;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      size="3xl"
      className="max-w-[90vw] lg:max-w-3xl"
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Metadata Header - Artist → Album → Song with Cover Art */}
        <div className="flex items-start gap-4" data-testid="metadata-header">
          {/* Cover Art */}
          {coverArt ? (
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg shadow-md">
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
              className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-bg-tertiary shadow-md"
              data-testid="cover-art-placeholder"
            >
              <svg
                className="h-10 w-10 text-text-muted"
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
          
          {/* Track Info */}
          <div className="min-w-0 flex-1">
            {/* Artist → Album breadcrumb */}
            {(artist || album) ? (
              <p className="text-sm text-text-secondary truncate">
                {artist}
                {artist && album ? (
                  <span className="mx-1.5 text-text-muted">→</span>
                ) : null}
                {album}
              </p>
            ) : null}
            
            {/* Song Title */}
            <h3 className="mt-1 text-lg font-semibold text-text-primary truncate">
              {displayTitle}
            </h3>
            
            {/* Track Number if available */}
            {trackInfo.trackNumber ? (
              <p className="mt-0.5 text-xs text-text-muted">
                Track {trackInfo.trackNumber}
              </p>
            ) : null}
          </div>
        </div>

        {/* Swarm Stats Row */}
        <div className="flex items-center justify-between gap-4">
          {/* Torrent Name */}
          {torrentName ? <p className="text-sm text-text-muted truncate flex-1">From: {torrentName}</p> : null}

          {/* Swarm Stats Badge */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {isLoadingSwarm && !swarmStats ? (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                <span>Loading swarm...</span>
              </div>
            ) : swarmStats ? (
              <>
                {/* Seeders */}
                <div className="flex items-center gap-1.5" title="Seeders (peers with complete file)">
                  <svg
                    className="h-4 w-4 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-medium text-green-500">
                    {swarmStats.seeders ?? '?'}
                  </span>
                </div>

                {/* Leechers */}
                <div className="flex items-center gap-1.5" title="Leechers (peers downloading)">
                  <svg
                    className="h-4 w-4 text-orange-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-medium text-orange-500">
                    {swarmStats.leechers ?? '?'}
                  </span>
                </div>

                {/* Refresh indicator */}
                {isLoadingSwarm ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-text-muted border-t-transparent" /> : null}
              </>
            ) : null}
          </div>
        </div>

        {/* Codec Check Notice - show while checking codec info */}
        {isCheckingCodec && !error ? <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm text-blue-500">
                Checking video codec compatibility...
              </span>
            </div>
          </div> : null}

        {/* Codec Info Display - show detected codec info */}
        {codecInfo && !isCheckingCodec && !error ? <div className={`rounded-lg border p-3 ${
          codecInfo.needsTranscoding
            ? 'border-orange-500/30 bg-orange-500/10'
            : 'border-green-500/30 bg-green-500/10'
        }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg
                  className={`h-4 w-4 ${codecInfo.needsTranscoding ? 'text-orange-500' : 'text-green-500'}`}
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
                <span className={`text-sm ${codecInfo.needsTranscoding ? 'text-orange-500' : 'text-green-500'}`}>
                  {codecInfo.needsTranscoding
                    ? 'Codec requires transcoding'
                    : 'Codec is browser-compatible'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                {codecInfo.videoCodec ? <span className="rounded bg-bg-tertiary px-1.5 py-0.5">{codecInfo.videoCodec}</span> : null}
                {codecInfo.audioCodec ? <span className="rounded bg-bg-tertiary px-1.5 py-0.5">{codecInfo.audioCodec}</span> : null}
                {codecInfo.resolution ? <span className="rounded bg-bg-tertiary px-1.5 py-0.5">{codecInfo.resolution}</span> : null}
              </div>
            </div>
          </div> : null}

        {/* Transcoding Notice - show when transcoding is active */}
        {isTranscoding && !error ? <div className="rounded-lg border border-accent-primary/30 bg-accent-primary/10 p-3">
            <div className="flex items-center gap-2">
              {isRetryingWithTranscode && isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              ) : (
                <svg
                  className="h-4 w-4 text-accent-primary"
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
              <span className="text-sm text-accent-primary">
                {isRetryingWithTranscode && isLoading
                  ? 'Unsupported codec detected. Switching to transcoding...'
                  : isLoading
                    ? 'Transcoding and loading stream...'
                    : 'Live transcoding enabled - converting to browser-compatible format'}
              </span>
            </div>
          </div> : null}

        {/* Error State with Try Again button */}
        {error ? <div className="rounded-lg border border-error/50 bg-error/10 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 flex-shrink-0 text-error"
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
              <div className="flex-1">
                <h4 className="font-medium text-error">Playback Error</h4>
                <p className="mt-1 text-sm text-text-muted">{error}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
                >
                  <svg
                    className="h-4 w-4"
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
                  Try Again
                </button>
              </div>
            </div>
          </div> : null}

        {/* Video Player - always render when we have a URL and it's video */}
        {streamUrl && mediaCategory === 'video' && !error ? <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            {/* Loading spinner overlay - shown while stream is initializing */}
            {showLoadingSpinner ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
                  <span className="text-xs sm:text-sm text-white">
                    {isTranscoding ? 'Starting transcoding...' : 'Loading stream...'}
                  </span>
                </div>
              </div> : null}
            {/* Play button overlay - shown when stream is ready but autoplay blocked */}
            {showPlayButton ? <button
                type="button"
                onClick={handleManualPlay}
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 transition-colors hover:bg-black/50"
                aria-label="Play video"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-accent-primary text-white shadow-lg transition-transform hover:scale-110">
                    <svg className="h-8 w-8 sm:h-10 sm:w-10 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <span className="text-sm sm:text-base text-white font-medium">Click to Play</span>
                </div>
              </button> : null}
            <VideoPlayer
              key={`video-${retryCount}-${isTranscoding ? 'transcode' : 'native'}`}
              src={streamUrl}
              filename={file.name}
              onReady={handlePlayerReady}
              onError={handlePlayerError}
              showTranscodingNotice={false}
              autoplay
            />
          </div> : null}

        {/* Audio Player - always render when we have a URL and it's audio */}
        {streamUrl && mediaCategory === 'audio' && !error ? <div className="relative w-full">
            {/* Loading spinner overlay - shown while stream is initializing */}
            {showLoadingSpinner ? <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-tertiary">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
                  <span className="text-sm text-text-muted">
                    {isTranscoding ? 'Starting transcoding...' : 'Loading stream...'}
                  </span>
                </div>
              </div> : null}
            {/* Play button overlay - shown when stream is ready but autoplay blocked */}
            {showPlayButton ? <button
                type="button"
                onClick={handleManualPlay}
                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-tertiary/90 transition-colors hover:bg-bg-tertiary/80"
                aria-label="Play audio"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-accent-primary text-white shadow-lg transition-transform hover:scale-110">
                    <svg className="h-7 w-7 sm:h-8 sm:w-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <span className="text-sm text-text-primary font-medium">Click to Play</span>
                </div>
              </button> : null}
            <AudioPlayer
              key={`audio-${retryCount}-${isTranscoding ? 'transcode' : 'native'}`}
              src={streamUrl}
              filename={file.name}
              title={displayTitle}
              artist={artist}
              album={album}
              coverArt={coverArt}
              connectionStatus={connectionStatus}
              showConnectionStats={true}
              onReady={handlePlayerReady}
              onError={handlePlayerError}
              showTranscodingNotice={false}
              autoplay
            />
          </div> : null}

        {/* Unsupported Media Type */}
        {streamUrl && mediaCategory !== 'video' && mediaCategory !== 'audio' ? <div className="rounded-lg border border-border-subtle bg-bg-tertiary p-6 text-center">
            <p className="text-text-secondary">
              This file type ({mediaCategory}) cannot be played in the browser.
            </p>
            <a
              href={streamUrl}
              download={file.name}
              className="mt-4 inline-block rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Download File
            </a>
          </div> : null}

        {/* Connection Status Footer - shown during loading and as health stats after ready */}
        {connectionStatus ? <div className={`rounded-lg border p-2 sm:p-3 ${
          isLoading
            ? 'border-border-subtle bg-bg-secondary'
            : 'border-green-500/30 bg-green-500/5'
        }`}>
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              {/* Status message with spinner or health indicator */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isLoading ? (
                  <div className="h-3 w-3 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent flex-shrink-0" />
                ) : (
                  <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-green-500 animate-pulse flex-shrink-0" title="Stream active" />
                )}
                <span className="text-xs sm:text-sm text-text-secondary truncate">
                  {isLoading ? connectionStatus.message : 'Streaming'}
                </span>
              </div>
              
              {/* Stats - always visible */}
              <div className="flex items-center gap-2 sm:gap-3 text-xs text-text-muted flex-shrink-0">
                {/* Peers */}
                <span title="Connected peers" className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
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
                    <span title="File download progress" className="flex items-center gap-1">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      <span className={displayProgress > 0.5 ? 'text-green-500' : 'text-yellow-500'}>
                        {(displayProgress * 100).toFixed(0)}%
                      </span>
                    </span>
                  );
                })()}
                
                {/* Download speed - always visible when active */}
                {connectionStatus.downloadSpeed > 0 && (
                  <span className="flex items-center gap-1 text-green-500" title="Download speed">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="hidden sm:inline">{formatSpeed(connectionStatus.downloadSpeed)}</span>
                    <span className="sm:hidden">{formatSpeedCompact(connectionStatus.downloadSpeed)}</span>
                  </span>
                )}
                
                {/* Upload speed - always visible when active */}
                {connectionStatus.uploadSpeed > 0 && (
                  <span className="flex items-center gap-1 text-blue-500" title="Upload speed">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="hidden sm:inline">{formatSpeed(connectionStatus.uploadSpeed)}</span>
                    <span className="sm:hidden">{formatSpeedCompact(connectionStatus.uploadSpeed)}</span>
                  </span>
                )}
              </div>
            </div>
            
            {/* Progress bar - show during loading or when not complete */}
            {/* Use fileProgress when available (more accurate for streaming individual files) */}
            {(() => {
              const displayProgress = connectionStatus.fileProgress ?? connectionStatus.progress;
              return displayProgress > 0 && displayProgress < 1 && (
                <div className="mt-1.5 sm:mt-2 h-1 w-full overflow-hidden rounded-full bg-bg-tertiary">
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
              <span className={isPlayerReady ? 'text-green-500' : 'text-yellow-500'}>
                {isPlayerReady ? 'Ready' : 'Loading'}
              </span>
              {swarmStats ? <span className="text-text-secondary">
                  Trackers: {swarmStats.trackersResponded}/{swarmStats.trackersQueried}
                </span> : null}
            </div>
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
