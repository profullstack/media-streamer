'use client';

/**
 * Podcast Player Context
 *
 * Global context for podcast audio playback that persists across routes.
 * Provides play/pause controls, seeking, and progress tracking.
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
  /** Play a specific episode */
  playEpisode: (episode: PodcastEpisodePlayback, podcast: PodcastPlayback) => void;
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
  
  // Play episode
  const playEpisode = useCallback((episode: PodcastEpisodePlayback, podcast: PodcastPlayback): void => {
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
    
    // Set new episode
    setCurrentEpisode(episode);
    setCurrentPodcast(podcast);
    setCurrentTime(0);
    setDuration(episode.duration ?? 0);
    
    // Load and play
    audio.src = episode.audioUrl;
    audio.load();
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
