'use client';

/**
 * TorrentFavoriteButton Component
 *
 * A heart icon button for adding/removing torrents from favorites.
 * Uses the useTorrentFavorite hook to manage state and API calls.
 */

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { HeartIcon, HeartFilledIcon } from '@/components/ui/icons';
import { useTorrentFavorite } from '@/hooks/use-favorites';

export interface TorrentFavoriteButtonProps {
  /** Torrent ID */
  torrentId: string;
  /** Initial favorite state */
  initialFavorited?: boolean;
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Callback when favorite state changes */
  onToggle?: (torrentId: string, isFavorited: boolean) => void;
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

export function TorrentFavoriteButton({
  torrentId,
  initialFavorited = false,
  size = 'md',
  className,
  onToggle,
  showLabel = false,
  label,
}: TorrentFavoriteButtonProps): React.ReactElement {
  const { isFavorited, isLoading, error, toggle } = useTorrentFavorite(
    torrentId,
    initialFavorited
  );

  const handleClick = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();

      if (isLoading) return;

      await toggle();

      // Call the onToggle callback if provided
      if (onToggle) {
        onToggle(torrentId, !isFavorited);
      }
    },
    [torrentId, isFavorited, isLoading, toggle, onToggle]
  );

  const sizeConfig = sizeClasses[size];
  const buttonLabel =
    label ?? (isFavorited ? 'Remove from favorites' : 'Add to favorites');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={buttonLabel}
      aria-pressed={isFavorited}
      data-torrent-id={torrentId}
      title={error ?? buttonLabel}
      className={cn(
        'inline-flex items-center gap-2 rounded-full transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeConfig.button,
        isFavorited
          ? 'text-status-error hover:text-status-error/80'
          : 'text-text-muted hover:text-status-error',
        error && 'text-status-warning',
        className
      )}
    >
      {isFavorited ? (
        <HeartFilledIcon
          size={sizeConfig.icon}
          className={cn(
            'transition-transform duration-200',
            isLoading && 'animate-pulse'
          )}
        />
      ) : (
        <HeartIcon
          size={sizeConfig.icon}
          className={cn(
            'transition-transform duration-200',
            isLoading && 'animate-pulse'
          )}
        />
      )}
      {showLabel ? (
        <span className="text-sm font-medium">
          {isFavorited ? 'Favorited' : 'Favorite'}
        </span>
      ) : null}
    </button>
  );
}

/**
 * TorrentFavoriteButtonWithBackground
 *
 * A variant with a background, useful for overlaying on images.
 */
export function TorrentFavoriteButtonWithBackground({
  className,
  ...props
}: TorrentFavoriteButtonProps): React.ReactElement {
  return (
    <TorrentFavoriteButton
      {...props}
      className={cn(
        'bg-bg-primary/80 backdrop-blur-sm hover:bg-bg-primary',
        className
      )}
    />
  );
}

export default TorrentFavoriteButton;
