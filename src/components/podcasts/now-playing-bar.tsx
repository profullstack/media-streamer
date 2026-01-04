'use client';

/**
 * Now Playing Bar Component
 *
 * A persistent audio player bar that appears at the bottom of the screen
 * when a podcast episode is playing. Shows podcast cover, episode title,
 * progress bar, and playback controls.
 */

import { useCallback } from 'react';
import { usePodcastPlayer } from '@/contexts/podcast-player';
import { cn } from '@/lib/utils';
import {
  PlayIcon,
  PauseIcon,
  PodcastIcon,
  CloseIcon,
} from '@/components/ui/icons';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0 || !isFinite(seconds)) return '--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Component
// ============================================================================

export function NowPlayingBar(): React.ReactElement | null {
  const {
    currentEpisode,
    currentPodcast,
    isPlaying,
    currentTime,
    duration,
    togglePlayPause,
    seek,
    stop,
  } = usePodcastPlayer();
  
  // Handle seek from progress bar
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const time = parseFloat(e.target.value);
    seek(time);
  }, [seek]);
  
  // Don't render if no episode is playing
  if (!currentEpisode) {
    return null;
  }
  
  // Get the cover image - prefer episode image, fall back to podcast image
  const coverImage = currentEpisode.imageUrl ?? currentPodcast?.imageUrl;
  
  // Calculate progress percentage for the visual bar
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-bg-secondary border-t border-border-default z-50">
      {/* Progress bar visual indicator at top of bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-bg-tertiary">
        <div 
          className="h-full bg-accent-primary transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Cover Image */}
          <div className="flex-shrink-0">
            {coverImage ? (
              <img
                src={coverImage}
                alt={currentEpisode.title}
                className="h-14 w-14 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-bg-tertiary">
                <PodcastIcon size={24} className="text-text-muted" />
              </div>
            )}
          </div>
          
          {/* Episode Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-text-primary truncate text-sm">
              {currentEpisode.title}
            </h4>
            <p className="text-xs text-text-muted truncate">
              {currentPodcast?.title}
            </p>
          </div>
          
          {/* Play/Pause Button */}
          <button
            onClick={togglePlayPause}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0',
              'bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors'
            )}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
          
          {/* Progress Bar and Time */}
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md">
            <span className="text-xs text-text-muted w-12 text-right tabular-nums">
              {formatDuration(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-bg-tertiary rounded-full appearance-none cursor-pointer accent-accent-primary"
              aria-label="Seek"
            />
            <span className="text-xs text-text-muted w-12 tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>
          
          {/* Close Button */}
          <button
            onClick={stop}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0',
              'text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors'
            )}
            aria-label="Stop"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        
        {/* Mobile Progress Bar */}
        <div className="sm:hidden mt-2 flex items-center gap-2">
          <span className="text-xs text-text-muted w-10 text-right tabular-nums">
            {formatDuration(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 bg-bg-tertiary rounded-full appearance-none cursor-pointer accent-accent-primary"
            aria-label="Seek"
          />
          <span className="text-xs text-text-muted w-10 tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
