'use client';

/**
 * Audio Player Component
 * 
 * A custom audio player with streaming support, progress tracking,
 * and format detection.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createAudioSource,
  formatDuration,
  type AudioSource,
} from '@/lib/audio';
import { cn } from '@/lib/utils';

/**
 * Audio player props
 */
export interface AudioPlayerProps {
  /** Source URL for the audio */
  src: string;
  /** Original filename for format detection */
  filename: string;
  /** Optional track title */
  title?: string;
  /** Optional artist name */
  artist?: string;
  /** Optional album name */
  album?: string;
  /** Optional cover art URL */
  coverArt?: string;
  /** Optional CSS class name */
  className?: string;
  /** Callback when audio is ready to play */
  onReady?: () => void;
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
  /** Whether to autoplay */
  autoplay?: boolean;
}

/**
 * Audio Player Component
 */
export function AudioPlayer({
  src,
  filename,
  title,
  artist,
  album,
  coverArt,
  className,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  onError,
  showTranscodingNotice = true,
  autoplay = false,
}: AudioPlayerProps): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  
  const [audioSource, setAudioSource] = useState<AudioSource | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create audio source configuration
  useEffect(() => {
    const source = createAudioSource(src, filename);
    setAudioSource(source);
    setError(null);
    setIsLoading(true);
  }, [src, filename]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (onTimeUpdate) {
        onTimeUpdate(audio.currentTime, audio.duration);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if (onPlay) onPlay();
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (onPause) onPause();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    const handleError = () => {
      const errorMessage = audio.error?.message ?? 'Failed to load audio';
      setError(errorMessage);
      setIsLoading(false);
      if (onError) {
        onError(new Error(errorMessage));
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      if (onReady) onReady();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [onReady, onPlay, onPause, onEnded, onTimeUpdate, onError]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err: Error) => {
        setError(err.message);
        if (onError) onError(err);
      });
    }
  }, [isPlaying, onError]);

  // Seek to position
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const progress = progressRef.current;
    if (!audio || !progress) return;

    const rect = progress.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume || 1;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn('audio-player rounded-lg border bg-card p-4', className)}>
      {/* Transcoding Notice */}
      {showTranscodingNotice && audioSource?.requiresTranscoding && (
        <div className="mb-4 rounded-lg border border-blue-500/50 bg-blue-500/10 p-3">
          <div className="flex items-start gap-2">
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
            <div className="text-sm">
              <span className="font-medium text-blue-500">
                Auto-transcoding: {audioSource.format.toUpperCase()} → MP3
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <div className="flex items-start gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0 text-destructive"
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
            <span className="text-sm text-destructive">{error}</span>
          </div>
        </div>
      )}

      {/* Player Content */}
      <div className="flex items-center gap-4">
        {/* Cover Art */}
        {coverArt ? (
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
            <img
              src={coverArt}
              alt={album ?? title ?? 'Cover art'}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
            <svg
              className="h-8 w-8 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        )}

        {/* Track Info & Controls */}
        <div className="flex-1 min-w-0">
          {/* Track Info */}
          <div className="mb-2">
            <h4 className="truncate font-medium">
              {title ?? filename}
            </h4>
            {(artist || album) && (
              <p className="truncate text-sm text-muted-foreground">
                {artist}
                {artist && album && ' • '}
                {album}
              </p>
            )}
          </div>

          {/* Progress Bar */}
          <div
            ref={progressRef}
            className="group relative h-2 cursor-pointer rounded-full bg-muted"
            onClick={handleSeek}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>

          {/* Time Display */}
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-center gap-4">
        {/* Skip Back */}
        <button
          type="button"
          onClick={() => skip(-10)}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Skip back 10 seconds"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={isLoading || !!error}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : isPlaying ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-6 w-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Skip Forward */}
        <button
          type="button"
          onClick={() => skip(10)}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Skip forward 10 seconds"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
          </svg>
        </button>
      </div>

      {/* Volume Control */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggleMute}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : volume < 0.5 ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          aria-label="Volume"
        />
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioSource?.src}
        autoPlay={autoplay}
        preload="metadata"
      />

      {/* Format Info */}
      {audioSource && (
        <div className="mt-3 flex items-center justify-center text-xs text-muted-foreground">
          <span>Format: {audioSource.format.toUpperCase()}</span>
          <span className="mx-2">•</span>
          <span>
            {audioSource.requiresTranscoding ? (
              <span className="text-blue-500">Auto-transcoding → MP3</span>
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
 * Compact audio player for lists
 */
export function AudioPlayerCompact({
  src,
  filename,
  title,
  artist,
  className,
  onPlay,
  onPause,
  onEnded,
}: Pick<AudioPlayerProps, 'src' | 'filename' | 'title' | 'artist' | 'className' | 'onPlay' | 'onPause' | 'onEnded'>): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioSource = createAudioSource(src, filename);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handlePlay = () => {
      setIsPlaying(true);
      if (onPlay) onPlay();
    };
    const handlePause = () => {
      setIsPlaying(false);
      if (onPause) onPause();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onPlay, onPause, onEnded]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border bg-card p-2', className)}>
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="h-4 w-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{title ?? filename}</p>
        {artist && <p className="truncate text-xs text-muted-foreground">{artist}</p>}
        <div className="mt-1 h-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <span className="flex-shrink-0 text-xs text-muted-foreground">
        {formatDuration(currentTime)} / {formatDuration(duration)}
      </span>

      <audio ref={audioRef} src={audioSource.src} preload="metadata" />
    </div>
  );
}
