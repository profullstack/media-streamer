'use client';

/**
 * Media Player Modal Component
 * 
 * A modal dialog that displays a video/audio player for streaming torrent files.
 * Shows the file title and provides playback controls.
 */

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { VideoPlayer } from '@/components/video/video-player';
import { AudioPlayer } from '@/components/audio/audio-player';
import { getMediaCategory } from '@/lib/utils';
import type { TorrentFile } from '@/types';

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
}

/**
 * Media Player Modal Component
 * 
 * Displays a modal with the appropriate player based on media type.
 */
export function MediaPlayerModal({
  isOpen,
  onClose,
  file,
  infohash,
  torrentName,
}: MediaPlayerModalProps): React.ReactElement | null {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Build stream URL when file changes
  useEffect(() => {
    if (file && infohash) {
      const url = `/api/stream?infohash=${infohash}&fileIndex=${file.fileIndex}`;
      setStreamUrl(url);
      setError(null);
      setIsLoading(true);
    } else {
      setStreamUrl(null);
    }
  }, [file, infohash]);

  // Handle player ready
  const handlePlayerReady = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Handle player error
  const handlePlayerError = useCallback((err: Error) => {
    setError(err.message);
    setIsLoading(false);
    console.error('[MediaPlayerModal] Player error:', err);
  }, []);

  // Handle close and cleanup
  const handleClose = useCallback(() => {
    setStreamUrl(null);
    setError(null);
    setIsLoading(false);
    onClose();
  }, [onClose]);

  if (!file) return null;

  const mediaCategory = getMediaCategory(file.name);
  const title = file.name;
  const subtitle = torrentName ? `From: ${torrentName}` : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="xl"
      className="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Subtitle */}
        {subtitle && (
          <p className="text-sm text-text-muted truncate">{subtitle}</p>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center rounded-lg bg-bg-tertiary">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
              <span className="text-sm text-text-muted">Loading stream...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
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
        )}

        {/* Video Player */}
        {streamUrl && mediaCategory === 'video' && (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <VideoPlayer
              src={streamUrl}
              filename={file.name}
              onReady={handlePlayerReady}
              onError={handlePlayerError}
              showTranscodingNotice={true}
            />
          </div>
        )}

        {/* Audio Player */}
        {streamUrl && mediaCategory === 'audio' && (
          <div className="w-full">
            <AudioPlayer
              src={streamUrl}
              filename={file.name}
              onPlay={handlePlayerReady}
              showTranscodingNotice={true}
            />
          </div>
        )}

        {/* Unsupported Media Type */}
        {streamUrl && mediaCategory !== 'video' && mediaCategory !== 'audio' && (
          <div className="rounded-lg border border-border-subtle bg-bg-tertiary p-6 text-center">
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
          </div>
        )}

        {/* Debug Info */}
        <div className="rounded-lg bg-bg-tertiary p-3 text-xs font-mono text-text-muted">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Type: {mediaCategory}</span>
            <span>Index: {file.fileIndex}</span>
            <span>Size: {formatBytes(file.size)}</span>
            <span className="break-all">Infohash: {infohash}</span>
          </div>
          {streamUrl && (
            <div className="mt-2 break-all">
              <span className="text-text-secondary">URL: </span>
              <span>{streamUrl}</span>
            </div>
          )}
        </div>
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
