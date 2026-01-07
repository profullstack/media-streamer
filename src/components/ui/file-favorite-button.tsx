'use client';

/**
 * File Favorite Button Component
 *
 * A heart icon button for adding/removing files from library favorites.
 * Uses the /api/library/favorites endpoint.
 */

import { useFileFavorite } from '@/hooks/use-favorites';
import { cn } from '@/lib/utils';
import { HeartIcon, HeartFilledIcon } from '@/components/ui/icons';

export interface FileFavoriteButtonProps {
  /** File ID from torrent_files table */
  fileId: string;
  /** Initial favorite state */
  initialFavorited?: boolean;
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Callback when favorite state changes */
  onToggle?: (fileId: string, isFavorited: boolean) => void;
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

export function FileFavoriteButton({
  fileId,
  initialFavorited = false,
  size = 'md',
  className,
  onToggle,
}: FileFavoriteButtonProps): React.ReactElement {
  const { isFavorited, isLoading, error, toggle } = useFileFavorite(fileId, initialFavorited);

  const handleClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    toggle()
      .then(() => {
        onToggle?.(fileId, !isFavorited);
      })
      .catch((err) => {
        console.error('[FileFavoriteButton] Toggle error:', err);
      });
  };

  const sizeConfig = sizeClasses[size];
  const label = error
    ? `Error: ${error}`
    : isFavorited
      ? 'Remove from favorites'
      : 'Add to favorites';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={label}
      aria-pressed={isFavorited}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeConfig.button,
        error
          ? 'text-yellow-500 hover:text-yellow-400'
          : isFavorited
            ? 'text-red-500 hover:text-red-400'
            : 'text-text-muted hover:text-red-500',
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
    </button>
  );
}

export default FileFavoriteButton;
