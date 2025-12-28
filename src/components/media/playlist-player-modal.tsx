'use client';

/**
 * Playlist Player Modal Component
 *
 * A modal dialog that plays multiple audio files sequentially.
 * Shows the current track, playlist, and provides playback controls.
 * Supports automatic advancement to the next track.
 * Updates Media Session API for iOS lock screen, CarPlay, and other media surfaces.
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
 * Playlist Player Modal Component
 *
 * Displays a modal with an audio player and playlist for sequential playback.
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
  const eventSourceRef = useRef<EventSource | null>(null);

  // Reset index when files change
  useEffect(() => {
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

  // Build stream URL for current file
  const streamUrl = currentFile
    ? `/api/stream?infohash=${infohash}&fileIndex=${currentFile.fileIndex}${isTranscoding ? '&transcode=auto' : ''}`
    : null;

  // Handle player ready
  const handlePlayerReady = useCallback(() => {
    console.log('[PlaylistPlayerModal] Player ready');
    setIsPlayerReady(true);
  }, []);

  // Handle player error
  const handlePlayerError = useCallback((err: Error) => {
    console.error('[PlaylistPlayerModal] Player error:', err);
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
    }
  }, [currentIndex, files.length]);

  // Handle previous track
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlayerReady(false);
      setError(null);
    }
  }, [currentIndex]);

  // Handle next track
  const handleNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlayerReady(false);
      setError(null);
    }
  }, [currentIndex, files.length]);

  // Handle track selection from playlist
  const handleSelectTrack = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsPlayerReady(false);
    setError(null);
  }, []);

  // Handle close and cleanup
  const handleClose = useCallback(() => {
    setError(null);
    setIsPlayerReady(false);
    setConnectionStatus(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    onClose();
  }, [onClose]);

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
  useEffect(() => {
    if (!isOpen || !infohash || !currentFile) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionStatus(null);
      return;
    }

    const url = `/api/stream/status?infohash=${infohash}&fileIndex=${currentFile.fileIndex}&persistent=true`;
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
  }, [isOpen, infohash, currentFile]);

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
              <div>
                <h4 className="font-medium text-error">Playback Error</h4>
                <p className="mt-1 text-sm text-text-muted">{error}</p>
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
              src={streamUrl}
              filename={currentFile.name}
              title={displayTitle}
              artist={displayArtist}
              album={displayAlbum}
              coverArt={coverArt}
              onReady={handlePlayerReady}
              onError={handlePlayerError}
              onEnded={handleTrackEnded}
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

        {/* Connection Status */}
        {connectionStatus ? (
          <div
            className={cn(
              'rounded-lg border p-2',
              isLoading
                ? 'border-border-subtle bg-bg-secondary'
                : 'border-green-500/30 bg-green-500/5'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isLoading ? (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent-primary border-t-transparent flex-shrink-0" />
                ) : (
                  <div className="h-3 w-3 rounded-full bg-green-500 flex-shrink-0" />
                )}
                <span className="text-xs text-text-secondary truncate">
                  {isLoading
                    ? connectionStatus.message
                    : `Streaming (${connectionStatus.numPeers} peer${connectionStatus.numPeers !== 1 ? 's' : ''})`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted flex-shrink-0">
                {connectionStatus.downloadSpeed > 0 && (
                  <span className="text-green-500">
                    {formatSpeed(connectionStatus.downloadSpeed)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Playlist */}
        <div className="rounded-lg border border-border-subtle">
          <div className="border-b border-border-subtle px-3 py-2">
            <h3 className="text-sm font-medium text-text-primary">Playlist</h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {files.map((file, index) => (
              <button
                key={file.fileIndex}
                type="button"
                onClick={() => handleSelectTrack(index)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                  index === currentIndex
                    ? 'bg-accent-audio/10 text-accent-audio'
                    : 'hover:bg-bg-hover text-text-secondary'
                )}
              >
                <span className="w-6 text-center text-xs">
                  {index === currentIndex ? (
                    <PlayIcon size={14} className="inline" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="truncate text-sm">{file.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
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

