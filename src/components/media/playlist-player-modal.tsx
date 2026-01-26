'use client';

/**
 * Playlist Player Modal Component
 *
 * A modal dialog that plays multiple audio files sequentially.
 * Shows the current track, playlist, and provides playback controls.
 * Supports automatic advancement to the next track.
 * Updates Media Session API for iOS lock screen, CarPlay, and other media surfaces.
 * Shows download progress for each track in the playlist to inform users they are torrenting.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import { AudioPlayer } from '@/components/audio/audio-player';
import { setMediaSessionActionHandlers } from '@/lib/media-session';
import { cn } from '@/lib/utils';
import {
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  MusicIcon,
  DownloadIcon,
  RefreshIcon,
} from '@/components/ui/icons';
import type { TorrentFile } from '@/types';

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
 * Connection status event from SSE endpoint
 */
interface ConnectionStatus {
  stage: 'initializing' | 'connecting' | 'searching_peers' | 'downloading_metadata' | 'buffering' | 'ready' | 'error';
  message: string;
  numPeers: number;
  /** Overall torrent progress (0-1) */
  progress: number;
  /** File-specific progress (0-1) - more accurate for streaming */
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
 * Download status for a file in the playlist
 */
interface FileDownloadStatus {
  /** File index */
  fileIndex: number;
  /** Download progress (0-1) */
  progress: number;
  /** Number of peers */
  numPeers: number;
  /** Download speed in bytes/sec */
  downloadSpeed: number;
  /** Whether the file is ready for playback */
  ready: boolean;
  /** Current stage */
  stage: string;
}

/**
 * Audio formats that require transcoding for browser playback
 */
const AUDIO_TRANSCODE_FORMATS = new Set(['wma', 'aiff', 'ape', 'flac']);

/**
 * Check if a file needs transcoding based on its extension
 */
function needsTranscoding(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_TRANSCODE_FORMATS.has(ext);
}

/**
 * Props for the PlaylistPlayerModal component
 */
export interface PlaylistPlayerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** The files to play */
  files: TorrentFile[];
  /** The infohash of the torrent */
  infohash: string;
  /** Optional torrent name for context */
  torrentName?: string;
  /** Optional starting index */
  startIndex?: number;
  /** Optional cover art URL for the album/collection */
  coverArt?: string;
  /** Optional artist name for the album/collection */
  artist?: string;
}

/**
 * Number of tracks to prefetch ahead of the current track
 */
const PREFETCH_AHEAD_COUNT = 2;

/**
 * Prefetch a file to start downloading it before it's needed
 */
async function prefetchFile(infohash: string, fileIndex: number): Promise<void> {
  try {
    console.log('[PlaylistPlayerModal] Prefetching file:', { infohash, fileIndex });
    const response = await fetch('/api/stream/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ infohash, fileIndex }),
    });
    
    if (response.ok) {
      const data = await response.json() as { success: boolean; fileName: string };
      console.log('[PlaylistPlayerModal] Prefetch initiated:', data.fileName);
    } else {
      console.warn('[PlaylistPlayerModal] Prefetch failed:', response.status);
    }
  } catch (err) {
    console.warn('[PlaylistPlayerModal] Prefetch error:', err);
  }
}

/**
 * Playlist Player Modal Component
 *
 * Displays a modal with an audio player and playlist for sequential playback.
 * Prefetches upcoming tracks for seamless playback.
 */
export function PlaylistPlayerModal({
  isOpen,
  onClose,
  files,
  infohash,
  torrentName,
  startIndex = 0,
  coverArt,
  artist,
}: PlaylistPlayerModalProps): React.ReactElement | null {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const prefetchedIndicesRef = useRef<Set<number>>(new Set());
  // State to trigger re-render when prefetch indices change (refs don't trigger re-renders)
  const [prefetchedIndicesVersion, setPrefetchedIndicesVersion] = useState(0);

  // Track download status for each file in the playlist
  const [fileDownloadStatuses, setFileDownloadStatuses] = useState<Map<number, FileDownloadStatus>>(new Map());
  const fileEventSourcesRef = useRef<Map<number, EventSource>>(new Map());
  
  // Track playback progress for the currently playing track
  const [playbackProgress, setPlaybackProgress] = useState<{ currentTime: number; duration: number }>({
    currentTime: 0,
    duration: 0,
  });

  // Reset index when files change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset when files change
    setCurrentIndex(startIndex);
  }, [files, startIndex]);

  // Current file
  const currentFile = files[currentIndex] ?? null;
  const isTranscoding = currentFile ? needsTranscoding(currentFile.name) : false;

  // Extract track info for Media Session
  const trackInfo = currentFile ? extractTrackInfo(currentFile.name) : null;
  const albumFromPath = currentFile ? extractAlbumFromPath(currentFile.path) : undefined;
  const artistFromPath = currentFile ? extractArtistFromPath(currentFile.path) : undefined;
  
  // Determine final artist and album values
  const displayArtist = artist ?? artistFromPath;
  const displayAlbum = albumFromPath ?? torrentName;
  const displayTitle = trackInfo?.title ?? currentFile?.name ?? '';

  // Build stream URL for current file (refreshKey forces cache bust on refresh)
  const streamUrl = currentFile
    ? `/api/stream?infohash=${infohash}&fileIndex=${currentFile.fileIndex}${isTranscoding ? '&transcode=auto' : ''}${refreshKey > 0 ? `&_r=${refreshKey}` : ''}`
    : null;

  // Track retry attempts for automatic recovery
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 2;

  // Handle player ready
  const handlePlayerReady = useCallback(() => {
    console.log('[PlaylistPlayerModal] Player ready');
    setIsPlayerReady(true);
    retryCountRef.current = 0; // Reset retry count on successful playback
  }, []);

  // Handle player error with automatic retry for format errors
  const handlePlayerError = useCallback((err: Error) => {
    console.error('[PlaylistPlayerModal] Player error:', err);

    // Check if it's a format error that might be recoverable (buffering issue)
    const isFormatError = err.message.toLowerCase().includes('format') ||
                          err.message.includes('MEDIA_ELEMENT_ERROR');

    if (isFormatError && retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++;
      console.log(`[PlaylistPlayerModal] Format error, attempting retry ${retryCountRef.current}/${MAX_RETRIES}`);

      // Reset state and retry after a short delay to allow more buffering
      setIsPlayerReady(false);
      setConnectionStatus(null);

      setTimeout(() => {
        setRefreshKey(prev => prev + 1);
      }, 1000);
      return;
    }

    // Reset retry count for non-format errors or after max retries
    retryCountRef.current = 0;
    setError(err.message);
    setIsPlayerReady(true);
  }, []);

  // Handle track ended - advance to next
  const handleTrackEnded = useCallback(() => {
    console.log('[PlaylistPlayerModal] Track ended, advancing to next');
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlayerReady(false);
      setError(null);
      setConnectionStatus(null); // Reset to wait for new track to buffer before playing
      setPlaybackProgress({ currentTime: 0, duration: 0 });
      retryCountRef.current = 0; // Reset retry count for new track
    }
  }, [currentIndex, files.length]);

  // Handle previous track
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlayerReady(false);
      setError(null);
      setConnectionStatus(null); // Reset to show loading state until new SSE connects
      setPlaybackProgress({ currentTime: 0, duration: 0 });
      retryCountRef.current = 0; // Reset retry count for new track
    }
  }, [currentIndex]);

  // Handle next track
  const handleNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlayerReady(false);
      setError(null);
      setConnectionStatus(null); // Reset to show loading state until new SSE connects
      setPlaybackProgress({ currentTime: 0, duration: 0 });
      retryCountRef.current = 0; // Reset retry count for new track
    }
  }, [currentIndex, files.length]);

  // Handle track selection from playlist
  const handleSelectTrack = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsPlayerReady(false);
    setError(null);
    setConnectionStatus(null); // Reset to show loading state until new SSE connects
    // Reset playback progress when changing tracks
    setPlaybackProgress({ currentTime: 0, duration: 0 });
    retryCountRef.current = 0; // Reset retry count for new track
  }, []);

  // Handle playback time updates from AudioPlayer
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    setPlaybackProgress({ currentTime, duration });
  }, []);

  // Handle close and cleanup
  const handleClose = useCallback(() => {
    setError(null);
    setIsPlayerReady(false);
    setConnectionStatus(null);
    setFileDownloadStatuses(new Map());
    
    // Close main event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Close all file event sources
    fileEventSourcesRef.current.forEach((es) => es.close());
    fileEventSourcesRef.current.clear();
    
    onClose();
  }, [onClose]);

  // Handle refresh button click - restarts the stream for the current track
  const handleRefresh = useCallback(() => {
    console.log('[PlaylistPlayerModal] User clicked refresh button');
    // Reset player state
    setIsPlayerReady(false);
    setError(null);
    setConnectionStatus(null);

    // Close existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Re-trigger connection by incrementing refreshKey (forces new stream URL)
    setRefreshKey(prev => prev + 1);
  }, []);

  // Set up Media Session action handlers for previous/next track
  useEffect(() => {
    if (!isOpen) return;

    // Set up previoustrack and nexttrack handlers
    setMediaSessionActionHandlers({
      previoustrack: currentIndex > 0 ? handlePrevious : undefined,
      nexttrack: currentIndex < files.length - 1 ? handleNext : undefined,
    });

    return () => {
      // Clear handlers on unmount
      setMediaSessionActionHandlers({
        previoustrack: undefined,
        nexttrack: undefined,
      });
    };
  }, [isOpen, currentIndex, files.length, handlePrevious, handleNext]);

  // Subscribe to connection status SSE
  // Use currentFile.fileIndex as dependency instead of currentFile object to avoid
  // unnecessary reconnections when the files array reference changes
  const currentFileIndex = currentFile?.fileIndex;
  useEffect(() => {
    if (!isOpen || !infohash || currentFileIndex === undefined) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional cleanup when modal closes
      setConnectionStatus(null);
      return;
    }

    const url = `/api/stream/status?infohash=${infohash}&fileIndex=${currentFileIndex}&persistent=true`;
    console.log('[PlaylistPlayerModal] Connecting to SSE:', url);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const status = JSON.parse(event.data as string) as ConnectionStatus;
        setConnectionStatus(status);
      } catch (err) {
        console.error('[PlaylistPlayerModal] Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[PlaylistPlayerModal] SSE error:', err);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [isOpen, infohash, currentFileIndex]);

  // Prefetch upcoming tracks when the current track starts playing
  // This ensures seamless playback by downloading the next tracks in advance
  useEffect(() => {
    if (!isOpen || !infohash || !isPlayerReady || files.length === 0) return;

    // Prefetch the next PREFETCH_AHEAD_COUNT tracks
    const prefetchPromises: Promise<void>[] = [];
    
    for (let i = 1; i <= PREFETCH_AHEAD_COUNT; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < files.length) {
        const nextFile = files[nextIndex];
        // Only prefetch if we haven't already prefetched this file
        if (!prefetchedIndicesRef.current.has(nextFile.fileIndex)) {
          prefetchedIndicesRef.current.add(nextFile.fileIndex);
          // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional trigger to subscribe to SSE for prefetched files
          setPrefetchedIndicesVersion(v => v + 1);
          prefetchPromises.push(prefetchFile(infohash, nextFile.fileIndex));
        }
      }
    }

    if (prefetchPromises.length > 0) {
      console.log('[PlaylistPlayerModal] Prefetching', prefetchPromises.length, 'upcoming tracks');
      void Promise.all(prefetchPromises);
    }
  }, [isOpen, infohash, currentIndex, isPlayerReady, files]);

  // Clear prefetch cache when modal closes
  useEffect(() => {
    if (!isOpen) {
      prefetchedIndicesRef.current.clear();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset when modal closes
      setPrefetchedIndicesVersion(0);
    }
  }, [isOpen]);

  // Subscribe to SSE for prefetched files to track their download progress
  // Use currentFileIndex instead of currentFile object to avoid unnecessary re-runs
  // prefetchedIndicesVersion triggers re-run when new files are prefetched (refs don't trigger re-renders)
  useEffect(() => {
    if (!isOpen || !infohash) return;

    // Subscribe to status updates for all prefetched files (except current file which has its own SSE)
    const prefetchedIndices = Array.from(prefetchedIndicesRef.current);

    for (const fileIndex of prefetchedIndices) {
      // Skip if we already have an event source for this file
      if (fileEventSourcesRef.current.has(fileIndex)) continue;
      // Skip the current file - it uses the main eventSourceRef
      if (currentFileIndex !== undefined && fileIndex === currentFileIndex) continue;

      const url = `/api/stream/status?infohash=${infohash}&fileIndex=${fileIndex}&persistent=true`;
      console.log('[PlaylistPlayerModal] Subscribing to prefetch status:', { fileIndex, url });

      const eventSource = new EventSource(url);
      fileEventSourcesRef.current.set(fileIndex, eventSource);

      eventSource.onmessage = (event) => {
        try {
          const status = JSON.parse(event.data as string) as ConnectionStatus;
          setFileDownloadStatuses((prev) => {
            const next = new Map(prev);
            next.set(fileIndex, {
              fileIndex,
              progress: status.fileProgress ?? status.progress,
              numPeers: status.numPeers,
              downloadSpeed: status.downloadSpeed,
              ready: status.fileReady ?? status.ready,
              stage: status.stage,
            });
            return next;
          });
        } catch (err) {
          console.error('[PlaylistPlayerModal] Failed to parse prefetch SSE data:', err);
        }
      };

      eventSource.onerror = () => {
        // Close and remove on error
        eventSource.close();
        fileEventSourcesRef.current.delete(fileIndex);
      };
    }

    // Cleanup function - close event sources for files that are no longer prefetched
    return () => {
      // We don't close all here - just let handleClose do that
    };
  }, [isOpen, infohash, currentFileIndex, prefetchedIndicesVersion]);

  // Update fileDownloadStatuses with current file's status from connectionStatus
  // Use currentFileIndex instead of currentFile object to avoid unnecessary re-runs
  useEffect(() => {
    if (!connectionStatus || currentFileIndex === undefined) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing external SSE status to state
    setFileDownloadStatuses((prev) => {
      const next = new Map(prev);
      next.set(currentFileIndex, {
        fileIndex: currentFileIndex,
        progress: connectionStatus.fileProgress ?? connectionStatus.progress,
        numPeers: connectionStatus.numPeers,
        downloadSpeed: connectionStatus.downloadSpeed,
        ready: connectionStatus.fileReady ?? connectionStatus.ready,
        stage: connectionStatus.stage,
      });
      return next;
    });
  }, [connectionStatus, currentFileIndex]);

  if (!currentFile || files.length === 0) return null;

  // Wait for file to have enough buffer before showing player
  // fileReady indicates the file has enough data buffered for streaming (2MB for audio, 10MB for video)
  // Falls back to ready (metadata ready) if fileReady is not yet available
  const isFileReady = connectionStatus?.fileReady ?? connectionStatus?.ready ?? false;
  const isLoading = !isPlayerReady && !error;
  const title = `Playing ${currentIndex + 1} of ${files.length}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="2xl"
      className="max-w-[90vw] lg:max-w-2xl"
    >
      <div className="space-y-4">
        {/* Current Track Info */}
        <div className="flex items-center gap-3 rounded-lg bg-bg-tertiary p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-audio/20">
            <MusicIcon className="text-accent-audio" size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-text-primary">{currentFile.name}</p>
            {torrentName ? (
              <p className="truncate text-sm text-text-muted">{torrentName}</p>
            ) : null}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-colors flex-shrink-0"
            aria-label="Refresh stream"
            title="Refresh stream"
          >
            <RefreshIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Transcoding Notice */}
        {isTranscoding && !error ? (
          <div className="rounded-lg border border-accent-primary/30 bg-accent-primary/10 p-3">
            <div className="flex items-center gap-2">
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
              <span className="text-sm text-accent-primary">
                {isLoading
                  ? 'Transcoding and loading stream...'
                  : 'Live transcoding enabled'}
              </span>
            </div>
          </div>
        ) : null}

        {/* Error State */}
        {error ? (
          <div className="rounded-lg border border-error/50 bg-error/10 p-4">
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
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setIsPlayerReady(false);
                    }}
                    className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Audio Player - only render when file has enough buffer to avoid HTTP errors */}
        {streamUrl && !error && isFileReady ? (
          <div className="relative w-full">
            {isLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-tertiary">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
                  <span className="text-sm text-text-muted">
                    {isTranscoding ? 'Starting transcoding...' : 'Loading stream...'}
                  </span>
                </div>
              </div>
            ) : null}
            <AudioPlayer
              key={`${infohash}-${currentFile.fileIndex}-${refreshKey}`}
              src={streamUrl}
              filename={currentFile.name}
              title={displayTitle}
              artist={displayArtist}
              album={displayAlbum}
              coverArt={coverArt}
              connectionStatus={connectionStatus}
              showConnectionStats={true}
              onReady={() => {
                console.log('[PlaylistPlayerModal] AudioPlayer ready with coverArt:', coverArt);
                handlePlayerReady();
              }}
              onError={handlePlayerError}
              onEnded={handleTrackEnded}
              onTimeUpdate={handleTimeUpdate}
              showTranscodingNotice={false}
              autoplay
            />
          </div>
        ) : streamUrl && !error && !isFileReady ? (
          <div className="flex items-center justify-center rounded-lg bg-bg-tertiary p-8">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
              <span className="text-sm text-text-muted">
                {connectionStatus?.message ?? 'Connecting to torrent...'}
              </span>
            </div>
          </div>
        ) : null}

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={cn(
              'rounded-full p-3 transition-colors',
              currentIndex === 0
                ? 'text-text-muted cursor-not-allowed'
                : 'text-text-primary hover:bg-bg-hover'
            )}
            aria-label="Previous track"
          >
            <SkipBackIcon size={24} />
          </button>
          <div className="text-sm text-text-secondary">
            {currentIndex + 1} / {files.length}
          </div>
          <button
            type="button"
            onClick={handleNext}
            disabled={currentIndex === files.length - 1}
            className={cn(
              'rounded-full p-3 transition-colors',
              currentIndex === files.length - 1
                ? 'text-text-muted cursor-not-allowed'
                : 'text-text-primary hover:bg-bg-hover'
            )}
            aria-label="Next track"
          >
            <SkipForwardIcon size={24} />
          </button>
        </div>

        {/* Playlist */}
        <div className="rounded-lg border border-border-subtle">
          <div className="border-b border-border-subtle px-3 py-2">
            <h3 className="text-sm font-medium text-text-primary">Playlist</h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {files.map((file, index) => {
              const downloadStatus = fileDownloadStatuses.get(file.fileIndex);
              const progress = downloadStatus?.progress ?? 0;
              const isDownloading = downloadStatus && !downloadStatus.ready && progress > 0;
              const isReady = downloadStatus?.ready ?? false;
              const isCurrentTrack = index === currentIndex;
              const folderName = extractAlbumFromPath(file.path);

              // Calculate playback progress percentage for current track
              const playbackPercent = isCurrentTrack && playbackProgress.duration > 0
                ? (playbackProgress.currentTime / playbackProgress.duration) * 100
                : 0;

              return (
                <button
                  key={file.fileIndex}
                  type="button"
                  onClick={() => handleSelectTrack(index)}
                  className={cn(
                    'relative flex w-full flex-col text-left transition-colors overflow-hidden',
                    isCurrentTrack
                      ? 'bg-accent-audio/10 text-accent-audio'
                      : 'hover:bg-bg-hover text-text-secondary'
                  )}
                >
                  {/* Main content row */}
                  <div className="relative flex w-full items-center gap-3 px-3 py-2">
                    {/* Download progress bar background */}
                    {(isDownloading || isReady) ? <div
                        className={cn(
                          'absolute inset-y-0 left-0 transition-all duration-300',
                          isReady
                            ? 'bg-success/10'
                            : 'bg-accent-primary/10'
                        )}
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      /> : null}

                    {/* Track number / play icon */}
                    <span className="relative z-10 w-6 text-center text-xs flex-shrink-0">
                      {isCurrentTrack ? (
                        <PlayIcon size={14} className="inline" />
                      ) : (
                        index + 1
                      )}
                    </span>

                    {/* Track name and folder */}
                    <div className="relative z-10 flex-1 min-w-0">
                      <span className="block truncate text-sm">{file.name}</span>
                      {folderName ? (
                        <span className="block truncate text-xs text-text-muted">{folderName}</span>
                      ) : null}
                    </div>

                    {/* Download status indicator */}
                    {downloadStatus ? <span className="relative z-10 flex items-center gap-1 text-xs flex-shrink-0">
                        {isDownloading ? (
                          <>
                            <DownloadIcon size={12} className="text-accent-primary animate-pulse" />
                            <span className="text-text-muted">{Math.round(progress * 100)}%</span>
                          </>
                        ) : isReady ? (
                          <svg
                            className="h-3 w-3 text-success"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : null}
                      </span> : null}
                  </div>

                  {/* Playback progress bar - only for currently playing track */}
                  {isCurrentTrack && playbackProgress.duration > 0 ? <div className="h-1 w-full bg-bg-tertiary">
                      <div
                        className="h-full bg-accent-audio transition-all duration-100"
                        style={{ width: `${playbackPercent}%` }}
                      />
                    </div> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

