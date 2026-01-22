'use client';

/**
 * Radio Station Card
 *
 * Displays a radio station with play button and favorite toggle.
 */

import { cn } from '@/lib/utils';
import { PlayIcon, HeartIcon, HeartFilledIcon, LoadingSpinner } from '@/components/ui/icons';
import { useRadioStationFavorite, type RadioStation } from '@/hooks/use-radio';

interface StationCardProps {
  station: RadioStation;
  isFavorited?: boolean;
  onPlay: (station: RadioStation) => void;
  onFavoriteChange?: () => void;
  className?: string;
}

export function StationCard({
  station,
  isFavorited = false,
  onPlay,
  onFavoriteChange,
  className,
}: StationCardProps): React.ReactElement {
  const { isFavorited: favStatus, isLoading: isFavLoading, toggle, error } = useRadioStationFavorite(
    station,
    isFavorited
  );

  const handleFavoriteClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    await toggle();
    onFavoriteChange?.();
  };

  const handlePlayClick = (): void => {
    onPlay(station);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-lg border border-border-default bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary',
        className
      )}
    >
      {/* Station Image */}
      <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-lg bg-bg-tertiary">
        {station.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={station.imageUrl}
            alt={station.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              // Hide broken image
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={48}
              height={48}
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

        {/* Play button overlay */}
        <button
          onClick={handlePlayClick}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={`Play ${station.name}`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-white">
            <PlayIcon size={28} />
          </div>
        </button>
      </div>

      {/* Station Info */}
      <div className="flex-1">
        <h3 className="mb-1 truncate text-sm font-medium text-text-primary">
          {station.name}
        </h3>
        {station.description ? (
          <p className="mb-1 truncate text-xs text-text-secondary">
            {station.description}
          </p>
        ) : null}
        {station.genre ? (
          <p className="truncate text-xs text-text-muted">{station.genre}</p>
        ) : null}
        {station.currentTrack ? (
          <p className="mt-1 truncate text-xs italic text-accent-primary">
            {station.currentTrack}
          </p>
        ) : null}
      </div>

      {/* Favorite button */}
      <button
        onClick={handleFavoriteClick}
        disabled={isFavLoading}
        className={cn(
          'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-bg-primary/80 transition-colors hover:bg-bg-primary',
          favStatus ? 'text-red-500' : 'text-text-muted hover:text-red-500'
        )}
        aria-label={favStatus ? 'Remove from favorites' : 'Add to favorites'}
        title={error ?? (favStatus ? 'Remove from favorites' : 'Add to favorites')}
      >
        {isFavLoading ? (
          <LoadingSpinner size={16} />
        ) : favStatus ? (
          <HeartFilledIcon size={16} />
        ) : (
          <HeartIcon size={16} />
        )}
      </button>
    </div>
  );
}
