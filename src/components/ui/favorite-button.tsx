'use client';

/**
 * FavoriteButton Component
 * 
 * A heart icon button for adding/removing items from favorites.
 * Can be used on any media item (music, video, ebook).
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { HeartIcon, HeartFilledIcon } from '@/components/ui/icons';

export type MediaType = 'music' | 'video' | 'ebook' | 'torrent' | 'channel';

export interface FavoriteButtonProps {
  /** Unique identifier for the media item */
  itemId: string;
  /** Type of media */
  mediaType: MediaType;
  /** Initial favorite state */
  initialFavorited?: boolean;
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Callback when favorite state changes */
  onToggle?: (itemId: string, isFavorited: boolean) => void | Promise<void>;
  /** Show label text */
  showLabel?: boolean;
  /** Custom label text */
  label?: string;
}

const sizeClasses = {
  sm: {
    button: 'p-1.5',
    icon: 16,
  },
  md: {
    button: 'p-2',
    icon: 20,
  },
  lg: {
    button: 'p-3',
    icon: 24,
  },
};

export function FavoriteButton({
  itemId,
  mediaType,
  initialFavorited = false,
  size = 'md',
  className,
  onToggle,
  showLabel = false,
  label,
}: FavoriteButtonProps): React.ReactElement {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = useCallback(async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading) return;

    setIsLoading(true);
    setIsAnimating(true);

    const newState = !isFavorited;

    try {
      // Call the toggle callback if provided
      if (onToggle) {
        await onToggle(itemId, newState);
      }

      // Update local state
      setIsFavorited(newState);

      // In a real app, this would call an API
      // await toggleFavorite(itemId, mediaType, newState);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      // Revert on error
      setIsFavorited(!newState);
    } finally {
      setIsLoading(false);
      // Reset animation after it completes
      setTimeout(() => setIsAnimating(false), 300);
    }
  }, [itemId, isFavorited, isLoading, onToggle]);

  const sizeConfig = sizeClasses[size];
  const buttonLabel = label || (isFavorited ? 'Remove from favorites' : 'Add to favorites');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={buttonLabel}
      aria-pressed={isFavorited}
      data-media-type={mediaType}
      data-item-id={itemId}
      className={cn(
        'inline-flex items-center gap-2 rounded-full transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeConfig.button,
        isFavorited
          ? 'text-status-error hover:text-status-error/80'
          : 'text-text-muted hover:text-status-error',
        isAnimating && 'scale-125',
        className
      )}
    >
      {isFavorited ? (
        <HeartFilledIcon
          size={sizeConfig.icon}
          className={cn(
            'transition-transform duration-200',
            isAnimating && 'animate-pulse'
          )}
        />
      ) : (
        <HeartIcon
          size={sizeConfig.icon}
          className="transition-transform duration-200"
        />
      )}
      {showLabel ? <span className="text-sm font-medium">
          {isFavorited ? 'Favorited' : 'Favorite'}
        </span> : null}
    </button>
  );
}

/**
 * FavoriteButtonWithBackground
 * 
 * A variant with a background, useful for overlaying on images.
 */
export function FavoriteButtonWithBackground({
  className,
  ...props
}: FavoriteButtonProps): React.ReactElement {
  return (
    <FavoriteButton
      {...props}
      className={cn(
        'bg-bg-primary/80 backdrop-blur-sm hover:bg-bg-primary',
        className
      )}
    />
  );
}

/**
 * FavoriteButtonOutlined
 * 
 * A variant with an outlined style.
 */
export function FavoriteButtonOutlined({
  className,
  ...props
}: FavoriteButtonProps): React.ReactElement {
  return (
    <FavoriteButton
      {...props}
      className={cn(
        'border border-border-default hover:border-status-error',
        className
      )}
    />
  );
}

export default FavoriteButton;
