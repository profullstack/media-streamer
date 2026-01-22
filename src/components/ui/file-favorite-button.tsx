'use client';

/**
 * File Favorite Button Component
 *
 * A heart icon button for adding/removing files from library favorites.
 * Uses the /api/library/favorites endpoint.
 */

import { useState, useEffect } from 'react';
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
  const { isFavorited, isLoading, error, toggle, clearError } = useFileFavorite(fileId, initialFavorited);
  const [showError, setShowError] = useState(false);

  // Show error popup when error occurs
  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => {
        setShowError(false);
        clearError?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

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

  // Check if it's an auth error
  const isAuthError = error?.toLowerCase().includes('authentication');

  return (
    <div className="relative inline-flex">
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

      {/* Error tooltip */}
      {showError && error ? (
        <div
          className={cn(
            'absolute z-50 px-3 py-2 text-xs font-medium rounded-md shadow-lg',
            'whitespace-nowrap animate-in fade-in slide-in-from-top-1 duration-200',
            'bottom-full left-1/2 -translate-x-1/2 mb-2',
            isAuthError
              ? 'bg-blue-600 text-white'
              : 'bg-red-600 text-white'
          )}
        >
          {isAuthError ? 'Sign in to favorite' : error}
          <div
            className={cn(
              'absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent',
              isAuthError ? 'border-t-blue-600' : 'border-t-red-600'
            )}
          />
        </div>
      ) : null}
    </div>
  );
}

export default FileFavoriteButton;
