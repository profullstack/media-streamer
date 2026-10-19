'use client';

/**
 * Video Player Component
 *
 * Built on @profullstack/player, the house player (profullstack.com/stack).
 * It picks the engine from the source: native for MP4/WebM, hls.js for HLS
 * wherever Media Source exists, native HLS on iOS, mpegts.js for transport
 * streams. Displays a transcoding notice for formats the server converts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPlayer, type PlayerHandle } from '@profullstack/player';
import '@profullstack/player/player.css';

import { createVideoSource, type VideoSource } from '@/lib/video';
import { cn } from '@/lib/utils';

/**
 * Video player props
 */
export interface VideoPlayerProps {
  /** Source URL for the video */
  src: string;
  /** Original filename for format detection */
  filename: string;
  /** Optional poster image URL */
  poster?: string;
  /** Optional CSS class name */
  className?: string;
  /** Callback when player is ready, with the media element being driven */
  onReady?: (media: HTMLMediaElement | null) => void;
  /** Callback when playback starts */
  onPlay?: () => void;
  /** Callback when playback pauses */
  onPause?: () => void;
  /** Callback when playback ends */
  onEnded?: () => void;
  /** Callback when time updates */
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Whether to show transcoding notice for unsupported formats */
  showTranscodingNotice?: boolean;
  /** Whether to autoplay when ready */
  autoplay?: boolean;
}

/**
 * Video Player Component
 */
export function VideoPlayer({
  src,
  filename,
  poster,
  className,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  onError,
  showTranscodingNotice = true,
  autoplay = false,
}: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Callbacks are read through a ref so a parent re-render with new function
  // identities does not tear the player down and restart the stream.
  const callbacks = useRef({ onReady, onPlay, onPause, onEnded, onTimeUpdate, onError });
  useEffect(() => {
    callbacks.current = { onReady, onPlay, onPause, onEnded, onTimeUpdate, onError };
  });

  // Create video source configuration
  const videoSource = useMemo<VideoSource>(() => createVideoSource(src, filename), [src, filename]);

  // Build the player when the source changes
  useEffect(() => {
    const root = videoRef.current;
    if (!root) return;

    // Stream URLs carry no extension (/api/stream?infohash=...), so the
    // playback MIME type is what tells the player which engine to use.
    const handle: PlayerHandle = createPlayer(root, {
      src: videoSource.src,
      mimeType: videoSource.playbackType,
      ...(poster ? { poster } : {}),
      autoplay,
    });
    const media = handle.media;

    const onLoaded = (): void => {
      setIsLoading(false);
      callbacks.current.onReady?.(media);
    };
    const onPlayEvent = (): void => callbacks.current.onPlay?.();
    const onPauseEvent = (): void => callbacks.current.onPause?.();
    const onEndedEvent = (): void => callbacks.current.onEnded?.();
    const onTime = (): void => {
      callbacks.current.onTimeUpdate?.(media.currentTime, media.duration || 0);
    };
    const onErrorEvent = (): void => {
      const mediaError = media.error;
      const message = mediaError?.message || `Media error code ${mediaError?.code ?? 'unknown'}`;
      setIsLoading(false);
      setError(message);
      callbacks.current.onError?.(new Error(message));
    };

    media.addEventListener('loadedmetadata', onLoaded, { once: true });
    media.addEventListener('play', onPlayEvent);
    media.addEventListener('pause', onPauseEvent);
    media.addEventListener('ended', onEndedEvent);
    media.addEventListener('timeupdate', onTime);
    media.addEventListener('error', onErrorEvent);

    return () => {
      media.removeEventListener('loadedmetadata', onLoaded);
      media.removeEventListener('play', onPlayEvent);
      media.removeEventListener('pause', onPauseEvent);
      media.removeEventListener('ended', onEndedEvent);
      media.removeEventListener('timeupdate', onTime);
      media.removeEventListener('error', onErrorEvent);
      handle.destroy();
      root.replaceChildren();
      // The next source starts from the loading state.
      setIsLoading(true);
      setError(null);
    };
  }, [videoSource, poster, autoplay]);

  return (
    <div className={cn('video-player-container', className)}>
      {/* Auto-Transcoding Notice - informational only */}
      {showTranscodingNotice && videoSource?.requiresTranscoding ? <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-blue-500"
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
            <span className="text-sm text-blue-500">
              Auto-transcoding {videoSource.format.toUpperCase()} → MP4 for browser playback
            </span>
          </div>
        </div> : null}

      {/* Loading State */}
      {isLoading ? <div className="flex h-64 items-center justify-center rounded-lg bg-muted">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading player...</span>
          </div>
        </div> : null}

      {/* Error State */}
      {error ? <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-destructive"
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
              <h4 className="font-medium text-destructive">Playback Error</h4>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </div> : null}

      {/* Video Player Container */}
      <div
        ref={videoRef}
        className={cn(
          'overflow-hidden rounded-lg',
          isLoading && 'hidden'
        )}
      />

      {/* Video Info */}
      {videoSource && !isLoading ? <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Format: {videoSource.format.toUpperCase()}</span>
          <span>
            {videoSource.requiresTranscoding ? (
              <span className="text-blue-500">Auto-transcoding → MP4</span>
            ) : (
              <span className="text-green-500">Native playback</span>
            )}
          </span>
        </div> : null}
    </div>
  );
}

/**
 * Video player with minimal controls (for thumbnails/previews)
 */
export function VideoPreview({
  src,
  filename,
  poster,
  className,
}: Pick<VideoPlayerProps, 'src' | 'filename' | 'poster' | 'className'>): React.ReactElement {
  return (
    <VideoPlayer
      src={src}
      filename={filename}
      poster={poster}
      className={className}
      showTranscodingNotice={false}
    />
  );
}
