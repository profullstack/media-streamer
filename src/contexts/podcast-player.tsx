'use client';

/**
 * Podcast Player Context
 *
 * Global context for podcast audio playback that persists across routes.
 * Provides play/pause controls, seeking, and progress tracking.
 * Automatically saves listen progress to the server.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';

// ============================================================================
// Constants
// ============================================================================

/** Save progress every 15 seconds during playback */
const PROGRESS_SAVE_INTERVAL = 15000;

// ============================================================================
// Types
// ============================================================================

/**
 * Podcast episode for playback
 */
export interface PodcastEpisodePlayback {
  id: string;
  guid: string;
  title: string;
  description: string | null;
  audioUrl: string;
  duration: number | null;
  publishedAt: string;
  imageUrl: string | null;
}

/**
 * Podcast info for display
 */
export interface PodcastPlayback {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  website: string | null;
  subscribedAt: string;
  notificationsEnabled: boolean;
}

/**
 * Podcast player context value
 */
export interface PodcastPlayerContextValue {
  /** Currently playing episode */
  currentEpisode: PodcastEpisodePlayback | null;
  /** Currently playing podcast */
  currentPodcast: PodcastPlayback | null;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Play a specific episode, optionally starting at a specific time */
  playEpisode: (episode: PodcastEpisodePlayback, podcast: PodcastPlayback, startTime?: number) => void;
  /** Toggle play/pause */
  togglePlayPause: () => void;
  /** Seek to a specific time */
  seek: (time: number) => void;
  /** Stop playback and clear current episode */
  stop: () => void;
}

// ============================================================================
// Context
// ============================================================================

const PodcastPlayerContext = createContext<PodcastPlayerContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface PodcastPlayerProviderProps {
  children: ReactNode;
}

export function PodcastPlayerProvider({ children }: PodcastPlayerProviderProps): React.ReactElement {
  // State
  const [currentEpisode, setCurrentEpisode] = useState<PodcastEpisodePlayback | null>(null);
  const [currentPodcast, setCurrentPodcast] = useState<PodcastPlayback | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Audio element ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Progress save interval ref
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track last saved time to avoid duplicate saves
  const lastSavedTimeRef = useRef<number>(0);

  // Save progress to server
  const saveProgress = useCallback(async (
    episodeId: string,
    timeSeconds: number,
    durationSeconds: number
  ): Promise<void> => {
    // Don't save if time hasn't changed significantly (within 2 seconds)
    if (Math.abs(timeSeconds - lastSavedTimeRef.current) < 2) {
      return;
    }

    lastSavedTimeRef.current = timeSeconds;

    try {
      await fetch('/api/podcasts/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          currentTimeSeconds: Math.floor(timeSeconds),
          durationSeconds: Math.floor(durationSeconds),
        }),
      });
    } catch (error) {
      console.error('[PodcastPlayer] Failed to save progress:', error);
    }
  }, []);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();

    const audio = audioRef.current;

    // Event handlers
    const handleTimeUpdate = (): void => {
      setCurrentTime(audio.currentTime);
    };

    const handleDurationChange = (): void => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleLoadedMetadata = (): void => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handlePlay = (): void => {
      setIsPlaying(true);
    };

    const handlePause = (): void => {
      setIsPlaying(false);
    };

    const handleEnded = (): void => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    // Add event listeners
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    // Cleanup
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Auto-save progress during playback
  useEffect(() => {
    // Clear existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Start interval when playing
    if (isPlaying && currentEpisode) {
      const episodeId = currentEpisode.id;

      progressIntervalRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (audio && !isNaN(audio.currentTime) && !isNaN(audio.duration)) {
          void saveProgress(episodeId, audio.currentTime, audio.duration);
        }
      }, PROGRESS_SAVE_INTERVAL);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isPlaying, currentEpisode, saveProgress]);

  // Save progress when pausing or when episode ends
  useEffect(() => {
    if (!isPlaying && currentEpisode) {
      const audio = audioRef.current;
      if (audio && !isNaN(audio.currentTime) && !isNaN(audio.duration) && audio.currentTime > 0) {
        void saveProgress(currentEpisode.id, audio.currentTime, audio.duration);
      }
    }
  }, [isPlaying, currentEpisode, saveProgress]);

  // Play episode
  const playEpisode = useCallback((episode: PodcastEpisodePlayback, podcast: PodcastPlayback, startTime?: number): void => {
    const audio = audioRef.current;
    if (!audio) return;

    // If same episode, just toggle play/pause
    if (currentEpisode?.id === episode.id) {
      if (audio.paused) {
        void audio.play();
      } else {
        audio.pause();
      }
      return;
    }

    // Reset last saved time for new episode
    lastSavedTimeRef.current = 0;

    // Set new episode
    setCurrentEpisode(episode);
    setCurrentPodcast(podcast);
    setCurrentTime(startTime ?? 0);
    setDuration(episode.duration ?? 0);

    // Load and play
    audio.src = episode.audioUrl;
    audio.load();

    // If we have a start time (resume position), seek to it after loading
    if (startTime && startTime > 0) {
      const handleCanPlay = (): void => {
        audio.currentTime = startTime;
        audio.removeEventListener('canplay', handleCanPlay);
      };
      audio.addEventListener('canplay', handleCanPlay);
    }

    void audio.play();
  }, [currentEpisode]);
  
  // Toggle play/pause
  const togglePlayPause = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio || !currentEpisode) return;
    
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, [currentEpisode]);
  
  // Seek to time
  const seek = useCallback((time: number): void => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);
  
  // Stop playback
  const stop = useCallback((): void => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    
    setCurrentEpisode(null);
    setCurrentPodcast(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);
  
  // Context value
  const value: PodcastPlayerContextValue = {
    currentEpisode,
    currentPodcast,
    isPlaying,
    currentTime,
    duration,
    playEpisode,
    togglePlayPause,
    seek,
    stop,
  };
  
  return (
    <PodcastPlayerContext.Provider value={value}>
      {children}
    </PodcastPlayerContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the podcast player context
 */
export function usePodcastPlayer(): PodcastPlayerContextValue {
  const context = useContext(PodcastPlayerContext);
  
  if (!context) {
    throw new Error('usePodcastPlayer must be used within a PodcastPlayerProvider');
  }
  
  return context;
}
