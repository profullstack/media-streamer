'use client';

/**
 * Add to Watchlist Button
 *
 * Reusable component for adding TMDB items to a user's watchlist.
 * - 1 watchlist: adds directly
 * - 2+ watchlists: shows dropdown to pick which one
 * - Shows checkmark if already in a watchlist
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { PlusIcon, CheckIcon, ChevronDownIcon } from '@/components/ui/icons';

export interface WatchlistItemData {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath?: string | null;
  overview?: string | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  genres?: string[];
  cast?: string[];
  directors?: string[];
}

interface WatchlistInfo {
  id: string;
  name: string;
}

interface AddToWatchlistButtonProps {
  item: WatchlistItemData;
  className?: string;
  compact?: boolean;
}

export function AddToWatchlistButton({ item, className, compact = false }: AddToWatchlistButtonProps): React.ReactElement | null {
  const { isLoggedIn } = useAuth();
  const [watchlists, setWatchlists] = useState<WatchlistInfo[]>([]);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch watchlists on mount
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchWatchlists = async (): Promise<void> => {
      try {
        const response = await fetch('/api/watchlists');
        if (response.ok) {
          const data = await response.json() as { watchlists: WatchlistInfo[] };
          setWatchlists(data.watchlists);
        }
      } catch {
        // Silently fail
      }
    };

    fetchWatchlists();
  }, [isLoggedIn]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  const addToWatchlist = useCallback(async (watchlistId: string): Promise<void> => {
    setIsLoading(true);
    setIsDropdownOpen(false);

    try {
      const response = await fetch(`/api/watchlists/${watchlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          overview: item.overview,
          releaseDate: item.releaseDate,
          voteAverage: item.voteAverage,
          genres: item.genres,
          castNames: item.cast,
          directors: item.directors,
        }),
      });

      if (response.ok || response.status === 409) {
        setAddedTo(prev => new Set([...prev, watchlistId]));
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, [item]);

  if (!isLoggedIn) return null;

  const isAdded = addedTo.size > 0;
  const hasMultiple = watchlists.length > 1;

  const handleClick = (): void => {
    if (isAdded) return;

    if (hasMultiple) {
      setIsDropdownOpen(!isDropdownOpen);
    } else if (watchlists.length === 1) {
      addToWatchlist(watchlists[0].id);
    } else {
      // No watchlists yet - create default and add
      const createAndAdd = async (): Promise<void> => {
        setIsLoading(true);
        try {
          const createRes = await fetch('/api/watchlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'My Watchlist' }),
          });

          if (createRes.ok) {
            const { watchlist } = await createRes.json() as { watchlist: WatchlistInfo };
            setWatchlists([watchlist]);
            await addToWatchlist(watchlist.id);
          }
        } catch {
          // Silently fail
        } finally {
          setIsLoading(false);
        }
      };
      createAndAdd();
    }
  };

  return (
    <div ref={dropdownRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading || isAdded}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          isAdded
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary',
          'disabled:opacity-50',
        )}
      >
        {isAdded ? (
          <>
            <CheckIcon size={14} />
            {!compact && 'In Watchlist'}
          </>
        ) : (
          <>
            <PlusIcon size={14} />
            {!compact && 'Watchlist'}
            {hasMultiple ? <ChevronDownIcon size={12} /> : null}
          </>
        )}
      </button>

      {/* Dropdown for multiple watchlists */}
      {isDropdownOpen && hasMultiple ? <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg">
          {watchlists.map((wl) => {
            const alreadyAdded = addedTo.has(wl.id);
            return (
              <button
                key={wl.id}
                type="button"
                onClick={() => addToWatchlist(wl.id)}
                disabled={alreadyAdded}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  alreadyAdded
                    ? 'text-green-400 cursor-default'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                )}
              >
                {alreadyAdded ? <CheckIcon size={14} /> : null}
                <span className="truncate">{wl.name}</span>
              </button>
            );
          })}
        </div> : null}
    </div>
  );
}
