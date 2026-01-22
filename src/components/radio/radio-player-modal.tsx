'use client';

/**
 * Radio Player Modal
 *
 * Audio player modal for streaming radio stations.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CloseIcon,
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  VolumeMuteIcon,
  LoadingSpinner,
} from '@/components/ui/icons';
import { useRadioStream, type RadioStation } from '@/hooks/use-radio';

interface RadioPlayerModalProps {
  station: RadioStation;
  isOpen: boolean;
  onClose: () => void;
}

export function RadioPlayerModal({
  station,
  isOpen,
  onClose,
}: RadioPlayerModalProps): React.ReactElement | null {
  const { preferredStream, isLoading, error, getStream } = useRadioStream();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  // Define togglePlayPause before the useEffect that uses it
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
      void getStream(station.id);
    }
  }, [isOpen, station.id, getStream]);

  // Auto-play when stream is ready
  useEffect(() => {
    if (preferredStream && audioRef.current && isOpen) {
      audioRef.current.src = preferredStream.url;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.play().catch((err) => {
        console.error('[RadioPlayer] Play error:', err);
        setAudioError('Failed to play audio');
      });
    }
  }, [preferredStream, isOpen, volume, isMuted]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset play state when closing
      setIsPlaying(false);
    }
  }, [isOpen]);

  // Handle keyboard events
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, togglePlayPause]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="radio-player-title"
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-bg-secondary p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-text-muted hover:text-text-primary"
          aria-label="Close player"
        >
          <CloseIcon size={24} />
        </button>

        {/* Station info */}
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

        {/* Audio element (hidden) */}
        <audio
          ref={audioRef}
          onPlay={handleAudioPlay}
          onPause={handleAudioPause}
          onError={handleAudioError}
          onWaiting={handleAudioWaiting}
          onCanPlay={handleAudioCanPlay}
        />

        {/* Loading state */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size={32} className="text-accent-primary" />
            <span className="ml-3 text-text-secondary">Loading stream...</span>
          </div>
        ) : null}

        {/* Error state */}
        {showError ? (
          <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-500">
            {error ?? audioError}
          </div>
        ) : null}

        {/* Player controls */}
        {showControls ? (
          <div className="space-y-4">
            {/* Play/Pause button */}
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

            {/* Volume control */}
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

            {/* Stream info */}
            <div className="text-center text-xs text-text-muted">
              {preferredStream.mediaType.toUpperCase()}
              {preferredStream.bitrate ? ` • ${preferredStream.bitrate} kbps` : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
