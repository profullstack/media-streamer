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
  options,
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
  const playerRef = useRef<Player | null>(null);
  /** Track if we're using native <video> instead of Video.js (iOS/Safari HLS path) */
  const isNativePlayerRef = useRef(false);
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

    // Don't reinitialize if player already exists (Video.js path)
    if (playerRef.current) {
      // Just update the source - use playbackType for the actual MIME type
      // (may be different from original type if transcoding is enabled)
      playerRef.current.src({
        src: videoSource.src,
        type: videoSource.playbackType,
      });
      return;
    }

    // Detect iOS/Safari + HLS early so we can decide the native-video path
    const isIOSOrSafari = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (/Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent))
    );
    const isHLSOnSafari = videoSource.format === 'hls' && isIOSOrSafari;

    // If we previously used native video, either update its src (still HLS on Safari)
    // or tear it down so Video.js can initialize for non-HLS sources.
    if (isNativePlayerRef.current && videoRef.current) {
      if (isHLSOnSafari) {
        const existingVideo = videoRef.current.querySelector('video');
        if (existingVideo) {
          existingVideo.src = videoSource.src;
          return;
        }
      } else {
        // Source is no longer HLS-on-Safari — tear down native element
        const existingVideo = videoRef.current.querySelector('video');
        if (existingVideo) {
          existingVideo.pause();
          existingVideo.removeAttribute('src');
          existingVideo.load();
          existingVideo.remove();
        }
        isNativePlayerRef.current = false;
      }
    }

    // Create video element
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    // iOS Safari requires playsinline for inline video playback (without it,
    // video only plays fullscreen and can fail silently in a modal context)
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoRef.current.appendChild(videoElement);

    // Merge options - autoplay prop takes precedence over options.autoplay
    // For transcoded fMP4 streams, disable VHS override so native <video> handles
    // progressive playback. VHS is designed for HLS/DASH, not raw fMP4 streams,
    // and will buffer indefinitely trying to parse segment metadata.
    //
    // For HLS on iOS/Safari, also use native playback — Safari's native HLS player
    // is far more reliable than Video.js VHS on iOS. VHS fights with Safari's
    // native MSE/HLS handling and causes "corruption" abort errors.
    const useNativePlayback = videoSource.requiresTranscoding || isHLSOnSafari;
    const html5Override = useNativePlayback ? {
      vhs: { overrideNative: false },
      nativeVideoTracks: true,
      nativeAudioTracks: true,
      nativeTextTracks: true,
    } : undefined;

    const playerOptions = getDefaultPlayerOptions({
      ...options,
      ...(html5Override ? { html5: html5Override } : {}),
      poster,
      autoplay: autoplay || options?.autoplay,
    });

    // On iOS/Safari with HLS, use native <video> element directly instead of
    // Video.js VHS tech. Safari has a highly optimized native HLS player that
    // handles m3u8 playlists natively. Video.js VHS intercepts HLS sources
    // even with overrideNative=false and can cause "corruption" abort errors,
    // media decode failures, and segment loading issues on iOS.
    if (isHLSOnSafari) {
      console.log('[VideoPlayer] iOS/Safari HLS detected — using native <video> element');
      // Create a native video element instead of using Video.js
      // Safari natively supports application/vnd.apple.mpegurl (HLS)
      const nativeVideo = document.createElement('video');
      nativeVideo.setAttribute('playsinline', '');
      nativeVideo.setAttribute('webkit-playsinline', '');
      nativeVideo.controls = true;
      nativeVideo.autoplay = autoplay || !!options?.autoplay;
      nativeVideo.style.width = '100%';
      nativeVideo.style.height = '100%';
      if (poster) nativeVideo.poster = poster;
      
      // Remove the video-js element we just created and use native instead
      videoRef.current.removeChild(videoElement);
      videoRef.current.appendChild(nativeVideo);

      nativeVideo.src = videoSource.src;

      nativeVideo.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        // Call onReady — the Player type is expected but modal handlers
        // don't actually use the player reference, they just track ready state
        if (onReady) onReady(null);
      });
      nativeVideo.addEventListener('play', () => onPlay?.());
      nativeVideo.addEventListener('pause', () => onPause?.());
      nativeVideo.addEventListener('ended', () => onEnded?.());
      nativeVideo.addEventListener('timeupdate', () => {
        onTimeUpdate?.(nativeVideo.currentTime, nativeVideo.duration || 0);
      });
      nativeVideo.addEventListener('error', () => {
        const mediaError = nativeVideo.error;
        const errorMessage = mediaError?.message || `Media error code ${mediaError?.code || 'unknown'}`;
        setError(errorMessage);
        onError?.(new Error(errorMessage));
      });

      // Try to play — catch autoplay blocks gracefully
      nativeVideo.play().catch((playErr) => {
        console.warn('[VideoPlayer] iOS autoplay blocked:', playErr.message);
        // Don't treat autoplay block as error — user can tap play
      });

      // Store ref for cleanup (no Video.js player in this path)
      playerRef.current = null;
      isNativePlayerRef.current = true;
      return;
    }

    // Initialize Video.js player
    const player = videojs(videoElement, playerOptions, function onPlayerReady() {
      setIsLoading(false);
      
      // Set source - use playbackType for the actual MIME type
      // (may be different from original type if transcoding is enabled)
      this.src({
        src: videoSource.src,
        type: videoSource.playbackType,
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

    // Note: Transcoded videos now wait for initial data on the server side
    // before starting FFmpeg, so no client-side reload is needed

    playerRef.current = player;
  }, [videoSource, options, poster, autoplay, onReady, onPlay, onPause, onEnded, onTimeUpdate, onError]);

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
      // Also clean up native video elements (iOS/Safari HLS path)
      if (videoRef.current) {
        const nativeVideo = videoRef.current.querySelector('video');
        if (nativeVideo) {
          nativeVideo.pause();
          nativeVideo.removeAttribute('src');
          nativeVideo.load();
          // Remove the native video element from the DOM to avoid duplicates on re-init
          if (nativeVideo.parentElement) {
            nativeVideo.parentElement.removeChild(nativeVideo);
          }
        }
      }
      // Reset native player state flag so subsequent inits start from a clean state
      if (isNativePlayerRef && typeof isNativePlayerRef.current !== 'undefined') {
        isNativePlayerRef.current = false;
      }
    };
  }, []);

  return (
    <div className={cn('video-player-container', className)}>
      {/* Auto-Transcoding Notice - informational only */}
      {showTranscodingNotice && videoSource?.requiresTranscoding ? <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0 text-blue-500"
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
        </div> : null}

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
