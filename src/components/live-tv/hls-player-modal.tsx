'use client';

/**
 * HLS Player Modal Component
 *
 * A modal component for playing live TV streams using HLS.js.
 * Displays channel information including logo and group.
 * Automatically proxies HTTP streams through /api/iptv-proxy for HTTPS compatibility.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import Hls from 'hls.js';
import type { Channel } from '@/lib/iptv';
import { CloseIcon, TvIcon } from '@/components/ui/icons';
import { shouldProxy, createProxyUrl } from '@/lib/iptv-proxy';

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute the stream URL, proxying HTTP URLs when on HTTPS
  const streamUrl = useMemo(() => {
    if (!channel.url) return null;
    
    // Check if we're on a secure page (HTTPS)
    const isSecurePage = typeof window !== 'undefined' && window.location.protocol === 'https:';
    
    // Proxy HTTP URLs when on HTTPS to avoid mixed content errors
    if (shouldProxy(channel.url, isSecurePage)) {
      return createProxyUrl(channel.url, '/api/iptv-proxy');
    }
    
    return channel.url;
  }, [channel.url]);

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

  // Initialize HLS.js
  useEffect(() => {
    if (!isOpen || !videoRef.current || !streamUrl) {
      return;
    }

    console.log('[HLS Player] Initializing with URL:', streamUrl);
    console.log('[HLS Player] Original channel URL:', channel.url);
    
    setIsLoading(true);
    setError(null);

    const video = videoRef.current;

    // Check if HLS is supported
    if (Hls.isSupported()) {
      console.log('[HLS Player] HLS.js is supported, creating instance');
      
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        debug: true, // Enable debug logging
      });

      hlsRef.current = hls;

      console.log('[HLS Player] Loading source:', streamUrl);
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[HLS Player] Manifest parsed successfully');
        setIsLoading(false);
        video.play().catch((err: unknown) => {
          console.error('[HLS Player] Autoplay failed:', err);
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('[HLS Player] HLS Error:', data.type, data.details, data);
        if (data.fatal) {
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
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        video.play().catch((err: unknown) => {
          console.error('[HLS Player] Autoplay failed:', err);
        });
      });
    } else {
      setError('HLS is not supported in this browser');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isOpen, streamUrl]);

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

      {/* Modal Content */}
      <div
        data-testid="modal-content"
        className="relative z-10 w-full max-w-4xl mx-4 bg-zinc-900 rounded-lg shadow-2xl overflow-hidden"
        onClick={handleContentClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            {/* Channel Logo */}
            {channel.logo ? (
              <img
                src={channel.logo}
                alt={`${channel.name} logo`}
                className="w-10 h-10 rounded object-contain bg-zinc-800"
                onError={(e) => {
                  // Hide broken images
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                data-testid="channel-icon-placeholder"
                className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center"
              >
                <TvIcon className="w-6 h-6 text-zinc-500" />
              </div>
            )}

            <div>
              <h2
                id="hls-player-title"
                className="text-lg font-semibold text-white"
              >
                {channel.name}
              </h2>
              {channel.group && (
                <span
                  data-testid="group-badge"
                  className="inline-block px-2 py-0.5 text-xs font-medium bg-zinc-800 text-zinc-400 rounded"
                >
                  {channel.group}
                </span>
              )}
            </div>
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
          {isLoading && !hasError && (
            <div
              data-testid="loading-indicator"
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-zinc-400 text-sm">Loading stream...</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center">
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
            </div>
          )}

          {/* Video Element */}
          <video
            ref={videoRef}
            data-testid="hls-video"
            className="w-full h-full"
            controls
            playsInline
            autoPlay
          />
        </div>
      </div>
    </div>
  );
}
