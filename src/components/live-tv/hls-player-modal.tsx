'use client';

/**
 * HLS Player Modal Component
 *
 * A modal component for playing live TV streams. Delivery is
 * @profullstack/player's `attachSource`: it picks hls.js, native HLS (iOS) or
 * mpegts.js for the source and attaches it to this component's own <video>,
 * so the modal keeps its UI (refresh, favourites, cast, fullscreen) while the
 * engine ladder is the one every fleet player shares.
 * Supports both HLS (.m3u8) and MPEG-TS (.ts) streams.
 * Displays channel information including logo and group.
 *
 * Note: HTTP streams are already proxied by the channels API via /api/iptv-proxy.
 * This component uses the URL as-is from the channel data.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { attachSource, type AttachedSource } from '@profullstack/player';
import { CastButton } from '@/components/cast/cast-button';
import type { Channel } from '@/lib/iptv';
import { CloseIcon, RefreshIcon, TvIcon } from '@/components/ui/icons';
import { useTvDetection } from '@/hooks/use-tv-detection';
import { IptvChannelFavoriteButton } from '@/components/ui/iptv-channel-favorite-button';
import { retryDelayMs } from '@/lib/live-tv/recovery';

export interface HlsPlayerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** The channel to play */
  channel: Channel;
  /** Playlist ID for favorites (optional) */
  playlistId?: string;
  /** Provider/playlist name (optional) */
  providerName?: string;
  /** Whether channel is initially favorited */
  initialFavorited?: boolean;
  /** Callback when favorite state changes */
  onFavoriteToggle?: (channelId: string, isFavorited: boolean) => void;
}

/**
 * HLS Player Modal for live TV streaming
 */
export function HlsPlayerModal({
  isOpen,
  onClose,
  channel,
  playlistId,
  providerName,
  initialFavorited = false,
  onFavoriteToggle,
}: HlsPlayerModalProps): React.ReactElement | null {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** The attached engine (hls.js, native or mpegts.js) for the current build. */
  const attachedRef = useRef<AttachedSource | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const stallCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlaybackTimeRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);
  /** What the engine says while it recovers on its own, e.g. "Reconnecting... (2/5)". */
  const [engineNotice, setEngineNotice] = useState<string | null>(null);
  const { isTv } = useTvDetection();

  // Maximum retry attempts before giving up
  const MAX_RETRIES = 5;
  // Base delay for exponential backoff (ms)
  const BASE_RETRY_DELAY = 2000;
  /*
   * Read at attach time rather than listed as an effect dependency: TV
   * detection can settle after the first render, and that must not tear down
   * and reconnect a stream that is already playing.
   */
  const isTvRef = useRef(isTv);
  useEffect(() => {
    isTvRef.current = isTv;
  }, [isTv]);

  // The stream URL is already proxied by the channels API if needed
  // HTTP URLs are converted to /api/iptv-proxy?url=... by the server
  const streamUrl = channel.url || null;
  
  // Detect if this is an HLS stream (.m3u8) or MPEG-TS stream (.ts)
  // HLS.js only works with HLS manifests, not raw MPEG-TS
  const isHlsStream = streamUrl ? (
    streamUrl.includes('.m3u8') ||
    streamUrl.includes('.m3u') ||
    // Check the original URL in proxy params
    (streamUrl.includes('/api/iptv-proxy') && (
      decodeURIComponent(streamUrl).includes('.m3u8') ||
      decodeURIComponent(streamUrl).includes('.m3u')
    ))
  ) : false;


  // Handle escape key and overflow
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Hide overflow on both html and body to prevent scrolling on large TV screens
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Focus close button when modal opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Exit fullscreen when modal closes
  useEffect(() => {
    if (!isOpen && document.fullscreenElement) {
      document.exitFullscreen().catch((err: unknown) => {
        console.warn('[HLS Player] Could not exit fullscreen:', err);
      });
    }
  }, [isOpen]);

  // Handle video play event to enter fullscreen
  const handleVideoPlay = useCallback((): void => {
    const video = videoRef.current;
    if (!video) return;

    // Check if already in fullscreen (supports vendor-prefixed variants)
    const isInFullscreen = !!(
      document.fullscreenElement ||
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
      (document as Document & { mozFullScreenElement?: Element }).mozFullScreenElement
    );

    if (isInFullscreen) return;

    // Try multiple fullscreen methods for maximum browser compatibility
    // Amazon Silk and other Chromium-based TV browsers need vendor-prefixed methods
    const tryFullscreen = (): void => {
      // Method 1: Standard API
      if (video.requestFullscreen) {
        video.requestFullscreen().catch((err: unknown) => {
          console.warn('[HLS Player] requestFullscreen failed, trying webkit:', err);
          tryWebkitFullscreen();
        });
        return;
      }
      tryWebkitFullscreen();
    };

    const tryWebkitFullscreen = (): void => {
      // Method 2: webkit prefix (Silk, older Chrome/Safari)
      const videoWithWebkit = video as HTMLVideoElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (videoWithWebkit.webkitRequestFullscreen) {
        videoWithWebkit.webkitRequestFullscreen().catch((err: unknown) => {
          console.warn('[HLS Player] webkitRequestFullscreen failed, trying webkitEnterFullscreen:', err);
          tryWebkitEnterFullscreen();
        });
        return;
      }
      tryWebkitEnterFullscreen();
    };

    const tryWebkitEnterFullscreen = (): void => {
      // Method 3: webkitEnterFullscreen (iOS Safari, some Android browsers)
      const videoWithWebkitEnter = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      if (videoWithWebkitEnter.webkitEnterFullscreen) {
        try {
          videoWithWebkitEnter.webkitEnterFullscreen();
        } catch (err: unknown) {
          console.warn('[HLS Player] webkitEnterFullscreen failed:', err);
        }
        return;
      }
      console.warn('[HLS Player] No fullscreen method available');
    };

    tryFullscreen();
  }, []);

  // Tear down whatever engine is attached. Safe to call twice.
  const destroyAttached = useCallback((): void => {
    if (attachedRef.current) {
      attachedRef.current.destroy();
      attachedRef.current = null;
    }
  }, []);

  // Handle refresh button click to reload the stream
  const handleRefresh = useCallback((): void => {
    console.log('[HLS Player] Refreshing stream...');

    // Clear any pending retry: a refresh is the rebuild it was waiting to do.
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    destroyAttached();

    // Reset retry count on manual refresh
    retryCountRef.current = 0;

    // Reset state and trigger re-initialization
    setIsLoading(true);
    setError(null);
    setIsRecovering(false);
    setRefreshKey((prev) => prev + 1);
  }, [destroyAttached]);

  // Auto-retry with exponential backoff
  const scheduleRetry = useCallback((): void => {
    if (retryCountRef.current >= MAX_RETRIES) {
      console.log('[HLS Player] Max retries reached, giving up');
      setError('Stream failed after multiple retries. Please try refreshing manually.');
      setIsRecovering(false);
      return;
    }

    const delay = retryDelayMs(retryCountRef.current, BASE_RETRY_DELAY);
    retryCountRef.current += 1;

    console.log(`[HLS Player] Scheduling retry ${retryCountRef.current}/${MAX_RETRIES} in ${delay}ms`);
    setIsRecovering(true);
    setError(`Connection lost. Retrying (${retryCountRef.current}/${MAX_RETRIES})...`);

    /*
     * Replace the pending retry rather than adding to it.
     *
     * Two errors close together must not leave two live timers, or the second
     * rebuild lands on top of the first -- two players, two sockets, and a
     * reader watching whichever won.
     */
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      console.log('[HLS Player] Auto-retrying stream...');

      destroyAttached();

      setIsLoading(true);
      setError(null);
      setIsRecovering(false);
      setRefreshKey((prev) => prev + 1);
    }, delay);
  }, [destroyAttached]);

  // Initialize video player
  useEffect(() => {
    if (!isOpen || !videoRef.current || !streamUrl) {
      return;
    }

    console.log('[HLS Player] Initializing with URL:', streamUrl);
    console.log('[HLS Player] Is HLS stream:', isHlsStream);

    setIsLoading(true);
    setError(null);
    setEngineNotice(null);

    const video = videoRef.current;
    let isMounted = true;

    /*
     * The kind is stated, not detected. The package reads the URL path, and a
     * proxied channel's path is /api/iptv-proxy -- the .m3u8 is in the query
     * string, where detection deliberately never looks.
     */
    const kind = isHlsStream ? 'hls' : 'mpegts';

    // mpegts.js resolves relative URLs against nothing useful off the main
    // thread; an absolute URL is correct everywhere.
    const src =
      kind === 'mpegts' && streamUrl.startsWith('/')
        ? `${window.location.origin}${streamUrl}`
        : streamUrl;

    /*
     * Recovery is layered, and each layer is the package's or this modal's,
     * never both for the same failure:
     *
     * - The engines retry on their own first. hls.js gets startLoad() /
     *   recoverMediaError() up to three times; mpegts.js is rebuilt up to five
     *   times with backoff and watched for silent stalls. While they do, the
     *   engine reports a notice ("Reconnecting...") and this modal shows it.
     * - When an HLS engine gives up, this modal rebuilds it on its own backoff
     *   ladder (scheduleRetry), as it always has.
     * - When the transport stream engine gives up, its ladder -- which is this
     *   modal's old ladder, ported -- is already spent, and a codec failure
     *   cannot be retried away, so the error is shown with Refresh beside it.
     */
    const onError = (message: string): void => {
      if (!isMounted) return;
      console.error('[HLS Player] Stream error:', message);
      if (kind === 'hls') {
        destroyAttached();
        scheduleRetry();
        return;
      }
      setEngineNotice(null);
      setIsRecovering(false);
      setIsLoading(false);
      setError(message);
    };

    const onNotice = (message: string | null): void => {
      if (!isMounted) return;
      if (message) console.log('[HLS Player] Engine notice:', message);
      setEngineNotice(message);
    };

    // Both engines and the native path fire this once there is something to show.
    const handleLoadedMetadata = (): void => {
      if (!isMounted) return;
      setIsLoading(false);
      video.play().catch((err: unknown) => {
        console.error('[HLS Player] Autoplay failed:', err);
      });
    };
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    void attachSource(video, {
      src,
      kind,
      live: true,
      isTv: isTvRef.current,
      withCredentials: false,
      onError,
      onNotice,
    })
      .then((attached) => {
        if (!isMounted) {
          attached.destroy();
          return;
        }
        attachedRef.current = attached;
        console.log('[HLS Player] Attached engine:', attached.engine);
        if (attached.unplayable) {
          // onError already reported it; nothing will ever play here.
          setIsLoading(false);
          setError(
            kind === 'hls'
              ? 'HLS is not supported in this browser'
              : 'MPEG-TS streams are not supported in this browser'
          );
        }
      })
      .catch((err: unknown) => {
        console.error('[HLS Player] Failed to load the player engine:', err);
        if (isMounted) {
          setIsLoading(false);
          setError(
            kind === 'hls' ? 'Failed to load HLS player' : 'Failed to load MPEG-TS player'
          );
        }
      });

    /*
     * Stall detection, for HLS only. The transport stream engine watches its
     * own media clock and rebuilds itself; doing it here as well would rebuild
     * the same stream twice. hls.js has no such watch, so a live playlist that
     * stops advancing without an error is caught here and rebuilt.
     */
    const startStallDetection = (): void => {
      if (kind !== 'hls') return;
      if (stallCheckIntervalRef.current) {
        clearInterval(stallCheckIntervalRef.current);
      }

      lastPlaybackTimeRef.current = 0;
      let stallCount = 0;

      stallCheckIntervalRef.current = setInterval(() => {
        if (!isMounted) return;

        const currentTime = video.currentTime;

        // If video is supposed to be playing but time hasn't changed
        if (!video.paused && !video.ended && currentTime === lastPlaybackTimeRef.current) {
          stallCount++;
          console.log(`[HLS Player] Stall detected (${stallCount}/3), currentTime: ${currentTime}`);

          // After 3 consecutive stalls (15 seconds), rebuild
          if (stallCount >= 3) {
            console.log('[HLS Player] Stream stalled, rebuilding...');
            stallCount = 0;
            scheduleRetry();
          }
        } else {
          stallCount = 0;
        }

        lastPlaybackTimeRef.current = currentTime;
      }, 5000); // Check every 5 seconds
    };

    // Start stall detection once video starts playing
    const handlePlaying = (): void => {
      console.log('[HLS Player] Video playing');
      // A picture is proof of recovery: the retry budget comes back.
      retryCountRef.current = 0;
      if (isMounted) {
        setIsLoading(false);
        setIsRecovering(false);
        setEngineNotice(null);
        setError(null);
      }
      startStallDetection();
    };

    video.addEventListener('playing', handlePlaying);

    return () => {
      isMounted = false;
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);

      if (stallCheckIntervalRef.current) {
        clearInterval(stallCheckIntervalRef.current);
        stallCheckIntervalRef.current = null;
      }

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      destroyAttached();
    };
  }, [isOpen, streamUrl, isHlsStream, refreshKey, scheduleRetry, destroyAttached]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Stop propagation for modal content clicks
  const handleContentClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      event.stopPropagation();
    },
    []
  );

  if (!isOpen) {
    return null;
  }

  const hasError = !channel.url || error;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hls-player-title"
      className="fixed inset-0 z-50 flex items-center justify-center min-w-screen min-h-screen"
    >
      {/* Backdrop - use fixed with explicit sizing for large TV screens */}
      <div
        data-testid="modal-backdrop"
        className="fixed inset-0 min-w-screen min-h-screen bg-black/80 backdrop-blur-xs"
        onClick={handleBackdropClick}
      />

      {/* Modal Content - smaller on TV screens to avoid scrolling */}
      <div
        data-testid="modal-content"
        className={`relative z-10 w-full mx-4 bg-zinc-900 rounded-lg shadow-2xl overflow-hidden ${
          isTv ? 'max-w-2xl' : 'max-w-4xl'
        }`}
        onClick={handleContentClick}
      >
        {/* Header - smaller padding on TV */}
        <div
          data-testid="modal-header"
          className={`flex items-center justify-between border-b border-zinc-800 ${
            isTv ? 'p-2' : 'p-4'
          }`}
        >
          <div className={`flex items-center ${isTv ? 'gap-2' : 'gap-3'}`}>
            {/* Channel Logo - smaller on TV */}
            {channel.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element -- External IPTV channel logos with onError fallback */
              <img
                src={channel.logo}
                alt={`${channel.name} logo`}
                className={`rounded object-contain bg-zinc-800 ${
                  isTv ? 'w-8 h-8' : 'w-10 h-10'
                }`}
                onError={(e) => {
                  // Hide broken images
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                data-testid="channel-icon-placeholder"
                className={`rounded bg-zinc-800 flex items-center justify-center ${
                  isTv ? 'w-8 h-8' : 'w-10 h-10'
                }`}
              >
                <TvIcon className={isTv ? 'w-5 h-5 text-zinc-500' : 'w-6 h-6 text-zinc-500'} />
              </div>
            )}

            <div>
              <h2
                id="hls-player-title"
                className={`font-semibold text-white ${isTv ? 'text-base' : 'text-lg'}`}
              >
                {channel.name}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {providerName ? <span className="text-xs text-zinc-500">{providerName}</span> : null}
                {channel.group ? <span
                    data-testid="group-badge"
                    className="inline-block px-2 py-0.5 text-xs font-medium bg-zinc-800 text-zinc-400 rounded-sm"
                  >
                    {channel.group}
                  </span> : null}
              </div>
            </div>

            {/* Favorite Button */}
            {playlistId ? <IptvChannelFavoriteButton
                playlistId={playlistId}
                channelId={channel.id}
                channelName={channel.name}
                channelUrl={channel.url}
                channelLogo={channel.logo}
                channelGroup={channel.group}
                tvgId={channel.tvgId}
                tvgName={channel.tvgName}
                initialFavorited={initialFavorited}
                size="md"
                onToggle={onFavoriteToggle}
                className="hover:bg-zinc-800"
              /> : null}

            <CastButton
              media={streamUrl ? {
                url: streamUrl,
                contentType: isHlsStream ? 'application/x-mpegURL' : undefined,
                title: channel.name,
                subtitle: channel.group ?? undefined,
                imageUrl: channel.logo ?? null,
                live: true,
                kind: 'video',
              } : null}
              getMediaElement={() => videoRef.current}
              className="text-zinc-300"
            />

            {/* Picture-in-Picture Button */}
            {document.pictureInPictureEnabled ? <button
                type="button"
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (document.pictureInPictureElement) {
                    document.exitPictureInPicture().catch(() => {});
                  } else {
                    video.requestPictureInPicture().catch(() => {});
                  }
                }}
                onTouchEnd={(e) => {
                  // Silk browser touch handling
                  e.preventDefault();
                  const video = videoRef.current;
                  if (!video) return;
                  if (document.pictureInPictureElement) {
                    document.exitPictureInPicture().catch(() => {});
                  } else {
                    video.requestPictureInPicture().catch(() => {});
                  }
                }}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
                aria-label="Picture-in-Picture"
                title="Picture-in-Picture (mini player)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <rect x="12" y="9" width="8" height="6" rx="1" />
                </svg>
              </button> : null}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              onTouchEnd={(e) => {
                // Silk browser touch handling
                e.preventDefault();
                handleRefresh();
              }}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
              aria-label="Refresh stream"
              title="Refresh stream"
            >
              <RefreshIcon className="w-5 h-5 pointer-events-none" />
            </button>
          </div>

          {/* Close Button */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            onTouchEnd={(e) => {
              // Silk browser touch handling
              e.preventDefault();
              onClose();
            }}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5 pointer-events-none" />
          </button>
        </div>

        {/* Video Container */}
        <div className="relative aspect-video bg-black">
          {/* Loading Indicator */}
          {(isLoading || isRecovering || engineNotice) && !hasError ? <div
              data-testid="loading-indicator"
              className="absolute inset-0 flex items-center justify-center bg-black/50"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-zinc-400 text-sm">
                  {engineNotice ??
                    (isRecovering
                      ? `Reconnecting (${retryCountRef.current}/${MAX_RETRIES})...`
                      : 'Loading stream...')}
                </span>
              </div>
            </div> : null}

          {/* Error Message */}
          {hasError ? <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                  <CloseIcon className="w-8 h-8 text-red-500" />
                </div>
                <p className="text-red-400 font-medium">
                  {!channel.url ? 'No stream URL available' : error}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div> : null}

          {/* Video Element */}
          <video
            ref={videoRef}
            data-testid="hls-video"
            className="w-full h-full"
            controls
            playsInline
            autoPlay
            onPlay={handleVideoPlay}
          />
        </div>
      </div>
    </div>
  );
}
