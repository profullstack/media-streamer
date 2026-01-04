'use client';

/**
 * HLS Player Modal Component
 *
 * A modal component for playing live TV streams using HLS.js and mpegts.js.
 * Supports both HLS (.m3u8) and MPEG-TS (.ts) streams.
 * Displays channel information including logo and group.
 *
 * Note: HTTP streams are already proxied by the channels API via /api/iptv-proxy.
 * This component uses the URL as-is from the channel data.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import Hls from 'hls.js';
// mpegts.js is dynamically imported to avoid SSR issues (it accesses window at module load)
import type { Channel } from '@/lib/iptv';
import { CloseIcon, RefreshIcon, TvIcon } from '@/components/ui/icons';
import { useTvDetection } from '@/hooks/use-tv-detection';

// Type for mpegts.js player - dynamically imported
type MpegtsPlayer = {
  attachMediaElement: (element: HTMLVideoElement) => void;
  load: () => void;
  destroy: () => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
};

type MpegtsModule = {
  default: {
    isSupported: () => boolean;
    createPlayer: (config: {
      type: string;
      isLive: boolean;
      url: string;
    }, options?: Record<string, unknown>) => MpegtsPlayer;
    Events: {
      MEDIA_INFO: string;
      ERROR: string;
      LOADING_COMPLETE: string;
    };
  };
};

export interface HlsPlayerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** The channel to play */
  channel: Channel;
}

/**
 * HLS Player Modal for live TV streaming
 */
export function HlsPlayerModal({
  isOpen,
  onClose,
  channel,
}: HlsPlayerModalProps): React.ReactElement | null {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<MpegtsPlayer | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { isTv } = useTvDetection();

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

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
    
    // Only request fullscreen if not already in fullscreen
    if (!document.fullscreenElement && video.requestFullscreen) {
      video.requestFullscreen().catch((err: unknown) => {
        console.warn('[HLS Player] Could not enter fullscreen:', err);
      });
    }
  }, []);

  // Handle refresh button click to reload the stream
  const handleRefresh = useCallback((): void => {
    console.log('[HLS Player] Refreshing stream...');
    
    // Destroy existing players
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }
    
    // Reset state and trigger re-initialization
    setIsLoading(true);
    setError(null);
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Initialize video player
  useEffect(() => {
    if (!isOpen || !videoRef.current || !streamUrl) {
      return;
    }

    console.log('[HLS Player] Initializing with URL:', streamUrl);
    console.log('[HLS Player] Original channel URL:', channel.url);
    console.log('[HLS Player] Is HLS stream:', isHlsStream);
    
    setIsLoading(true);
    setError(null);

    const video = videoRef.current;
    let isMounted = true;

    // For HLS streams (.m3u8), use HLS.js
    if (isHlsStream) {
      if (Hls.isSupported()) {
        console.log('[HLS Player] HLS.js is supported, creating instance for HLS stream');
        
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          debug: false, // Disable debug logging in production
        });

        hlsRef.current = hls;

        console.log('[HLS Player] Loading HLS source:', streamUrl);
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[HLS Player] HLS manifest parsed successfully');
          if (isMounted) {
            setIsLoading(false);
            video.play().catch((err: unknown) => {
              console.error('[HLS Player] Autoplay failed:', err);
            });
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.error('[HLS Player] HLS Error:', data.type, data.details, data);
          if (data.fatal && isMounted) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('[HLS Player] Fatal network error, attempting reload');
                setError('Network error - please check your connection');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('[HLS Player] Fatal media error, attempting recovery');
                setError('Media error - trying to recover');
                hls.recoverMediaError();
                break;
              default:
                console.error('[HLS Player] Fatal error, destroying HLS instance');
                setError('An error occurred while playing the stream');
                hls.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        console.log('[HLS Player] Using native HLS support (Safari)');
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          if (isMounted) {
            setIsLoading(false);
            video.play().catch((err: unknown) => {
              console.error('[HLS Player] Autoplay failed:', err);
            });
          }
        });
      } else {
        setError('HLS is not supported in this browser');
      }
    } else {
      // For MPEG-TS streams (.ts), use mpegts.js (dynamically imported)
      console.log('[HLS Player] Non-HLS stream detected, using mpegts.js');
      
      // Dynamic import to avoid SSR issues
      import('mpegts.js').then((mpegtsModule: MpegtsModule) => {
        const mpegts = mpegtsModule.default;
        
        if (!isMounted) return;
        
        if (mpegts.isSupported()) {
          console.log('[HLS Player] mpegts.js is supported, creating player');
          
          // mpegts.js runs in a Web Worker which requires absolute URLs
          // Convert relative URLs to absolute URLs
          const absoluteUrl = streamUrl.startsWith('/')
            ? `${window.location.origin}${streamUrl}`
            : streamUrl;
          
          console.log('[HLS Player] Using absolute URL for mpegts.js:', absoluteUrl);
          
          const player = mpegts.createPlayer({
            type: 'mpegts',
            isLive: true,
            url: absoluteUrl,
          }, {
            // Worker for better performance
            enableWorker: true,
            // Enable stash buffer for smoother playback through proxy
            enableStashBuffer: true,
            // Larger initial buffer to prevent stuttering (384KB)
            stashInitialSize: 384 * 1024,
            // Disable aggressive latency chasing - causes buffering through proxy
            liveBufferLatencyChasing: false,
            // More tolerant latency settings for proxied streams
            liveBufferLatencyMaxLatency: 5.0,
            liveBufferLatencyMinRemain: 1.0,
            // Auto cleanup for memory management
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 30,
            autoCleanupMinBackwardDuration: 10,
            // Larger IO buffer for network stability
            lazyLoad: false,
            lazyLoadMaxDuration: 60,
            lazyLoadRecoverDuration: 30,
            // Seek optimization
            seekType: 'range',
          });
          
          mpegtsRef.current = player;
          
          player.attachMediaElement(video);
          player.load();
          
          player.on(mpegts.Events.MEDIA_INFO, () => {
            console.log('[HLS Player] MPEG-TS media info received');
            if (isMounted) {
              setIsLoading(false);
              video.play().catch((err: unknown) => {
                console.error('[HLS Player] Autoplay failed:', err);
              });
            }
          });
          
          player.on(mpegts.Events.ERROR, (errorType: unknown, errorDetail: unknown) => {
            console.error('[HLS Player] MPEG-TS Error:', errorType, errorDetail);
            if (isMounted) {
              setError(`Stream error: ${String(errorDetail)}`);
            }
          });
          
          player.on(mpegts.Events.LOADING_COMPLETE, () => {
            console.log('[HLS Player] MPEG-TS loading complete');
          });
        } else {
          console.error('[HLS Player] mpegts.js is not supported in this browser');
          if (isMounted) {
            setError('MPEG-TS streams are not supported in this browser');
          }
        }
      }).catch((err: unknown) => {
        console.error('[HLS Player] Failed to load mpegts.js:', err);
        if (isMounted) {
          setError('Failed to load MPEG-TS player');
        }
      });
    }

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [isOpen, streamUrl, isHlsStream, channel.url, refreshKey]);

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
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
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
              {channel.group ? <span
                  data-testid="group-badge"
                  className="inline-block px-2 py-0.5 text-xs font-medium bg-zinc-800 text-zinc-400 rounded"
                >
                  {channel.group}
                </span> : null}
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Refresh stream"
              title="Refresh stream"
            >
              <RefreshIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Close Button */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Video Container */}
        <div className="relative aspect-video bg-black">
          {/* Loading Indicator */}
          {isLoading && !hasError ? <div
              data-testid="loading-indicator"
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-zinc-400 text-sm">Loading stream...</span>
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
