'use client';

/**
 * Radio Player Modal
 *
 * Audio player modal for streaming radio stations. Uses HLS.js for SiriusXM
 * and other HLS streams, falls back to direct audio playback for MP3/AAC.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import {
  CloseIcon,
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  VolumeMuteIcon,
  LoadingSpinner,
} from '@/components/ui/icons';
import { useRadioStream, type RadioStation } from '@/hooks/use-radio';
import {
  setMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  setMediaSessionActionHandlers,
  clearMediaSession,
} from '@/lib/media-session';

interface RadioPlayerModalProps {
  station: RadioStation;
  isOpen: boolean;
  onClose: () => void;
  quality?: '256' | '128' | '64' | '32';
}

export function RadioPlayerModal({
  station,
  isOpen,
  onClose,
  quality,
}: RadioPlayerModalProps): React.ReactElement | null {
  const { preferredStream, isLoading, error, getStream } = useRadioStream();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  const togglePlayPause = useCallback((): void => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error('[RadioPlayer] Play error:', err);
        setAudioError('Failed to play audio');
      });
    }
  }, [isPlaying]);

  // Fetch stream when modal opens
  useEffect(() => {
    if (isOpen && station.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset error state when reopening
      setAudioError(null);
      void getStream(station.id, quality);
    }
  }, [isOpen, station.id, getStream, quality]);

  // Attach stream (HLS or direct)
  useEffect(() => {
    if (!preferredStream || !audioRef.current || !isOpen) return;

    const audio = audioRef.current;
    audio.volume = isMuted ? 0 : volume;

    const isHls =
      preferredStream.mediaType === 'hls' ||
      preferredStream.url.includes('.m3u8') ||
      preferredStream.url.includes('m3u8?');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(preferredStream.url);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio.play().catch((err) => {
          console.error('[RadioPlayer] HLS play error:', err);
          setAudioError('Failed to play audio');
        });
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          console.error('[RadioPlayer] HLS fatal:', data.type, data.details);
          setAudioError('Stream error. The station may be offline.');
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Direct (MP3/AAC) or native HLS (Safari)
    audio.src = preferredStream.url;
    audio.play().catch((err) => {
      console.error('[RadioPlayer] Play error:', err);
      setAudioError('Failed to play audio');
    });

    return () => {
      audio.removeAttribute('src');
      audio.load();
    };
  }, [preferredStream, isOpen, volume, isMuted]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset play state when closing
      setIsPlaying(false);
      clearMediaSession();
    }
  }, [isOpen]);

  // Keyboard / overflow handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMuted((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    if (isOpen) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (isOpen) {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    };
  }, [isOpen, onClose, togglePlayPause]);

  // Media Session metadata
  useEffect(() => {
    if (!isOpen || !preferredStream) return;

    setMediaSessionMetadata({
      title: station.name,
      artist: station.genre ?? 'Live Radio',
      album: station.description ?? 'Radio Station',
      artwork: station.imageUrl ?? undefined,
    });

    return () => {
      clearMediaSession();
    };
  }, [isOpen, preferredStream, station.name, station.genre, station.description, station.imageUrl]);

  useEffect(() => {
    if (!isOpen) return;
    updateMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused');
  }, [isPlaying, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const audio = audioRef.current;

    setMediaSessionActionHandlers({
      play: () => {
        audio?.play().catch(() => {});
      },
      pause: () => {
        audio?.pause();
      },
      stop: () => {
        if (audio) {
          audio.pause();
          audio.removeAttribute('src');
        }
        onClose();
      },
    });

    return () => {
      setMediaSessionActionHandlers({
        play: undefined,
        pause: undefined,
        stop: undefined,
      });
    };
  }, [isOpen, onClose]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : newVolume;
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback((): void => {
    setIsMuted((prev) => {
      if (audioRef.current) {
        audioRef.current.volume = prev ? volume : 0;
      }
      return !prev;
    });
  }, [volume]);

  const handleAudioPlay = useCallback((): void => {
    setIsPlaying(true);
    setIsBuffering(false);
  }, []);

  const handleAudioPause = useCallback((): void => {
    setIsPlaying(false);
  }, []);

  const handleAudioError = useCallback((): void => {
    setAudioError('Stream error. The station may be offline.');
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  const handleAudioWaiting = useCallback((): void => {
    setIsBuffering(true);
  }, []);

  const handleAudioCanPlay = useCallback((): void => {
    setIsBuffering(false);
  }, []);

  if (!isOpen) return null;

  const showError = (error ?? audioError) && !isLoading;
  const showControls = !isLoading && !error && preferredStream;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center min-w-screen min-h-screen bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="radio-player-title"
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-bg-secondary p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-text-muted hover:text-text-primary"
          aria-label="Close player"
        >
          <CloseIcon size={24} />
        </button>

        <div className="mb-6 flex items-center gap-4">
          {station.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={station.imageUrl}
              alt={station.name}
              className="h-20 w-20 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-bg-tertiary text-text-muted">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={32}
                height={32}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m4.9 19.1 15-15" />
                <circle cx="12" cy="12" r="2" />
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
                <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
              </svg>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <h2
              id="radio-player-title"
              className="truncate text-lg font-semibold text-text-primary"
            >
              {station.name}
            </h2>
            {station.description ? (
              <p className="truncate text-sm text-text-secondary">
                {station.description}
              </p>
            ) : null}
            {station.genre ? (
              <p className="text-xs text-text-muted">{station.genre}</p>
            ) : null}
          </div>
        </div>

        <audio
          ref={audioRef}
          onPlay={handleAudioPlay}
          onPause={handleAudioPause}
          onError={handleAudioError}
          onWaiting={handleAudioWaiting}
          onCanPlay={handleAudioCanPlay}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size={32} className="text-accent-primary" />
            <span className="ml-3 text-text-secondary">Loading stream...</span>
          </div>
        ) : null}

        {showError ? (
          <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-500">
            {error ?? audioError}
          </div>
        ) : null}

        {showControls ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <button
                onClick={togglePlayPause}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary text-white transition-transform hover:scale-105"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isBuffering ? (
                  <LoadingSpinner size={32} />
                ) : isPlaying ? (
                  <PauseIcon size={32} />
                ) : (
                  <PlayIcon size={32} />
                )}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                className="text-text-secondary hover:text-text-primary"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeMuteIcon size={24} />
                ) : (
                  <VolumeIcon size={24} />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 accent-accent-primary"
                aria-label="Volume"
              />
            </div>

            <div className="text-center text-xs text-text-muted">
              {preferredStream.mediaType.toUpperCase()}
              {preferredStream.bitrate ? ` • ${preferredStream.bitrate} kbps` : null}
              {quality ? ` • ${quality}k` : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
