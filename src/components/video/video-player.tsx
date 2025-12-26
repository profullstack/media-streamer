'use client';

/**
 * Video Player Component
 * 
 * A robust video player using Video.js with HLS.js support for streaming.
 * Supports MP4, WebM, OGG, HLS (M3U8), and displays transcoding notice for unsupported formats.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

import {
  createVideoSource,
  getDefaultPlayerOptions,
  type VideoSource,
  type PlayerOptions,
} from '@/lib/video';
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
  /** Optional player options override */
  options?: Partial<PlayerOptions>;
  /** Callback when player is ready */
  onReady?: (player: Player) => void;
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
}

/**
 * Video Player Component
 */
export function VideoPlayer({
  src,
  filename,
  poster,
  className,
  options,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  onError,
  showTranscodingNotice = true,
}: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create video source configuration
  useEffect(() => {
    const source = createVideoSource(src, filename);
    setVideoSource(source);
  }, [src, filename]);

  // Initialize player
  const initializePlayer = useCallback(() => {
    if (!videoRef.current || !videoSource) return;

    // Don't reinitialize if player already exists
    if (playerRef.current) {
      // Just update the source
      playerRef.current.src({
        src: videoSource.src,
        type: videoSource.type,
      });
      return;
    }

    // Create video element
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    videoRef.current.appendChild(videoElement);

    // Merge options
    const playerOptions = getDefaultPlayerOptions({
      ...options,
      poster,
    });

    // Initialize Video.js player
    const player = videojs(videoElement, playerOptions, function onPlayerReady() {
      setIsLoading(false);
      
      // Set source
      this.src({
        src: videoSource.src,
        type: videoSource.type,
      });

      // Call onReady callback
      if (onReady) {
        onReady(this);
      }
    });

    // Event handlers
    player.on('play', () => {
      if (onPlay) onPlay();
    });

    player.on('pause', () => {
      if (onPause) onPause();
    });

    player.on('ended', () => {
      if (onEnded) onEnded();
    });

    player.on('timeupdate', () => {
      if (onTimeUpdate) {
        const currentTime = player.currentTime() ?? 0;
        const duration = player.duration() ?? 0;
        onTimeUpdate(currentTime, duration);
      }
    });

    player.on('error', () => {
      const playerError = player.error();
      const errorMessage = playerError?.message ?? 'Unknown playback error';
      setError(errorMessage);
      if (onError) {
        onError(new Error(errorMessage));
      }
    });

    playerRef.current = player;
  }, [videoSource, options, poster, onReady, onPlay, onPause, onEnded, onTimeUpdate, onError]);

  // Initialize player when source is ready
  useEffect(() => {
    if (videoSource) {
      initializePlayer();
    }
  }, [videoSource, initializePlayer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const player = playerRef.current;
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div className={cn('video-player-container', className)}>
      {/* Transcoding Notice */}
      {showTranscodingNotice && videoSource?.requiresTranscoding && (
        <div className="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-yellow-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h4 className="font-medium text-yellow-500">
                Format Requires Transcoding
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                The video format ({videoSource.format.toUpperCase()}) is not natively supported by browsers.
                Enable server-side transcoding in settings for playback, or download the file to play locally.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex h-64 items-center justify-center rounded-lg bg-muted">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading player...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-destructive"
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
        </div>
      )}

      {/* Video Player Container */}
      <div
        ref={videoRef}
        data-vjs-player
        className={cn(
          'video-js-container overflow-hidden rounded-lg',
          isLoading && 'hidden'
        )}
      />

      {/* Video Info */}
      {videoSource && !isLoading && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Format: {videoSource.format.toUpperCase()}</span>
          <span>
            {videoSource.requiresTranscoding ? (
              <span className="text-yellow-500">Requires transcoding</span>
            ) : (
              <span className="text-green-500">Native playback</span>
            )}
          </span>
        </div>
      )}
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
      options={{
        controls: true,
        autoplay: false,
        preload: 'metadata',
        fluid: true,
        controlBar: {
          fullscreenToggle: true,
          pictureInPictureToggle: false,
          volumePanel: true,
          playToggle: true,
          progressControl: true,
          currentTimeDisplay: false,
          timeDivider: false,
          durationDisplay: false,
          remainingTimeDisplay: false,
        },
      }}
    />
  );
}
