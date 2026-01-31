'use client';

/**
 * Watchlist Content (Client Component)
 *
 * Displays the user's watchlist items with:
 * - Watchlist selector dropdown
 * - Create/rename/delete watchlist actions
 * - Card layout matching Upcoming page
 * - Find Torrent, Add magnet, Remove buttons per item
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { MediaThumbnail } from '@/components/ui/media-placeholder';
import { AddMagnetModal } from '@/components/torrents/add-magnet-modal';
import {
  SearchIcon,
  StarIcon,
  ClockIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  ChevronDownIcon,
  LoadingSpinner,
  MovieIcon,
} from '@/components/ui/icons';

interface WatchlistData {
  id: string;
  name: string;
  item_count?: number;
  created_at: string;
  updated_at: string;
}

interface WatchlistItemData {
  id: string;
  watchlist_id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  overview: string | null;
  release_date: string | null;
  vote_average: number | null;
  genres: string[] | null;
  cast_names: string[] | null;
  directors: string[] | null;
  position: number;
  created_at: string;
}

interface WatchlistContentProps {
  initialWatchlists: WatchlistData[];
  initialItems: WatchlistItemData[];
  initialActiveWatchlistId: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRating(rating: number | null): string {
  if (rating === null || rating === 0) return 'N/A';
  return Number(rating).toFixed(1);
}

function getYear(dateStr: string | null): string {
  if (!dateStr) return '';
  return dateStr.substring(0, 4);
}

function buildSearchQuery(title: string, releaseDate: string | null): string {
  const parts = [title];
  const year = getYear(releaseDate);
  if (year) parts.push(year);
  return parts.join(' ');
}

/**
 * Watchlist Item Card
 */
function WatchlistItemCard({
  item,
  onFindTorrent,
  onAddMagnet,
  onRemove,
  isRemoving,
}: {
  item: WatchlistItemData;
  onFindTorrent: (query: string) => void;
  onAddMagnet: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-lg bg-bg-secondary border border-border-primary hover:border-accent-primary transition-all">
      <div className="flex flex-col sm:flex-row">
        {/* Poster */}
        <div className="relative w-full sm:w-40 flex-shrink-0">
          <MediaThumbnail
            src={item.poster_path ?? undefined}
            alt={item.title}
            contentType={item.media_type === 'movie' ? 'movie' : 'tvshow'}
            className="aspect-[2/3] w-full sm:h-60"
          />
          {/* Rating badge */}
          {item.vote_average !== null && Number(item.vote_average) > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-yellow-400">
              <StarIcon size={12} />
              {formatRating(item.vote_average)}
            </div>
          )}
          {/* Media type badge */}
          <div className="absolute bottom-2 left-2 rounded bg-accent-primary/90 px-1.5 py-0.5 text-xs font-medium text-white uppercase">
            {item.media_type}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-3">
          {/* Title */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary group-hover:text-accent-primary transition-colors">
              {item.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary mt-1">
              <span>{formatDate(item.release_date)}</span>
            </div>
          </div>

          {/* Genres */}
          {item.genres && item.genres.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.genres.slice(0, 4).map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : null}

          {/* Overview */}
          {item.overview ? (
            <p className={cn(
              'text-sm text-text-secondary',
              !isExpanded && 'line-clamp-2'
            )}>
              {item.overview}
            </p>
          ) : null}
          {item.overview && item.overview.length > 150 ? (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-accent-primary hover:underline"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}

          {/* Cast */}
          {item.cast_names && item.cast_names.length > 0 ? (
            <div className="text-sm">
              <span className="text-text-muted">Cast: </span>
              <span className="text-text-secondary">
                {item.cast_names.slice(0, 3).join(', ')}
              </span>
            </div>
          ) : null}

          {/* Directors */}
          {item.directors && item.directors.length > 0 ? (
            <div className="text-sm">
              <span className="text-text-muted">
                {item.media_type === 'tv' ? 'Created by: ' : 'Director: '}
              </span>
              <span className="text-text-secondary">
                {item.directors.join(', ')}
              </span>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onFindTorrent(buildSearchQuery(item.title, item.release_date))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
            >
              <SearchIcon size={14} />
              Find Torrent
            </button>

            <button
              type="button"
              onClick={onAddMagnet}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium',
                'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30',
                'transition-colors'
              )}
              title="Add magnet URL"
            >
              <PlusIcon size={14} />
              Add
            </button>

            <button
              type="button"
              onClick={onRemove}
              disabled={isRemoving}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              title="Remove from watchlist"
            >
              <TrashIcon size={14} />
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Watchlist Content Component
 */
export function WatchlistContent({
  initialWatchlists,
  initialItems,
  initialActiveWatchlistId,
}: WatchlistContentProps): React.ReactElement {
  const router = useRouter();

  const [watchlists, setWatchlists] = useState<WatchlistData[]>(initialWatchlists);
  const [items, setItems] = useState<WatchlistItemData[]>(initialItems);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(initialActiveWatchlistId);
  const [isLoading, setIsLoading] = useState(false);
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());

  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Create watchlist state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Add Magnet modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId);

  // Switch watchlist
  const switchWatchlist = useCallback(async (watchlistId: string): Promise<void> => {
    setActiveWatchlistId(watchlistId);
    setIsDropdownOpen(false);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/watchlists/${watchlistId}`);
      if (response.ok) {
        const data = await response.json() as { items: WatchlistItemData[] };
        setItems(data.items);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create watchlist
  const handleCreateWatchlist = useCallback(async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;

    try {
      const response = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        const data = await response.json() as { watchlist: WatchlistData };
        setWatchlists(prev => [...prev, data.watchlist]);
        setNewName('');
        setIsCreating(false);
        // Switch to new watchlist
        setActiveWatchlistId(data.watchlist.id);
        setItems([]);
      }
    } catch {
      // Silently fail
    }
  }, [newName]);

  // Rename watchlist
  const handleRename = useCallback(async (watchlistId: string): Promise<void> => {
    const name = renameValue.trim();
    if (!name) return;

    try {
      const response = await fetch(`/api/watchlists/${watchlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        const data = await response.json() as { watchlist: WatchlistData };
        setWatchlists(prev => prev.map(w => w.id === watchlistId ? { ...w, name: data.watchlist.name } : w));
        setRenamingId(null);
        setRenameValue('');
      }
    } catch {
      // Silently fail
    }
  }, [renameValue]);

  // Delete watchlist
  const handleDelete = useCallback(async (watchlistId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/watchlists/${watchlistId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const remaining = watchlists.filter(w => w.id !== watchlistId);
        setWatchlists(remaining);

        if (activeWatchlistId === watchlistId) {
          if (remaining.length > 0) {
            switchWatchlist(remaining[0].id);
          } else {
            setActiveWatchlistId(null);
            setItems([]);
          }
        }
      }
    } catch {
      // Silently fail
    }
  }, [watchlists, activeWatchlistId, switchWatchlist]);

  // Remove item
  const handleRemoveItem = useCallback(async (item: WatchlistItemData): Promise<void> => {
    if (!activeWatchlistId) return;

    const itemKey = `${item.tmdb_id}-${item.media_type}`;
    setRemovingItems(prev => new Set([...prev, itemKey]));

    try {
      const response = await fetch(`/api/watchlists/${activeWatchlistId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: item.tmdb_id, mediaType: item.media_type }),
      });

      if (response.ok) {
        setItems(prev => prev.filter(i =>
          !(i.tmdb_id === item.tmdb_id && i.media_type === item.media_type)
        ));
      }
    } catch {
      // Silently fail
    } finally {
      setRemovingItems(prev => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  }, [activeWatchlistId]);

  const handleFindTorrent = (query: string): void => {
    router.push(`/find-torrents?q=${encodeURIComponent(query)}`);
  };

  const handleAddSuccess = (torrent: { id: string }): void => {
    setIsAddModalOpen(false);
    setTimeout(() => {
      router.push(`/torrents/${torrent.id}`);
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Watchlist</h1>
          <p className="text-sm text-text-secondary mt-1">
            Your saved movies and TV shows
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
        >
          <PlusIcon size={14} />
          New Watchlist
        </button>
      </div>

      {/* Create Watchlist Form */}
      {isCreating ? (
        <div className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-secondary p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateWatchlist();
              if (e.key === 'Escape') setIsCreating(false);
            }}
            placeholder="Watchlist name..."
            className="input flex-1 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreateWatchlist}
            className="btn-primary px-3 py-1.5 text-sm"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => { setIsCreating(false); setNewName(''); }}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Watchlist Selector */}
      {watchlists.length > 0 ? (
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
            >
              {activeWatchlist?.name ?? 'Select Watchlist'}
              <ChevronDownIcon size={14} />
            </button>

            {isDropdownOpen ? (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg">
                {watchlists.map((wl) => (
                  <div key={wl.id} className="flex items-center justify-between px-1">
                    {renamingId === wl.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(wl.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={() => setRenamingId(null)}
                        className="input mx-1 my-0.5 text-sm"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => switchWatchlist(wl.id)}
                        className={cn(
                          'flex-1 px-3 py-2 text-sm text-left transition-colors rounded',
                          wl.id === activeWatchlistId
                            ? 'text-accent-primary bg-accent-primary/10'
                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                        )}
                      >
                        {wl.name}
                        {wl.item_count !== undefined ? (
                          <span className="ml-1 text-text-muted">({wl.item_count})</span>
                        ) : null}
                      </button>
                    )}

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(wl.id);
                          setRenameValue(wl.name);
                        }}
                        className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover"
                        title="Rename"
                      >
                        <EditIcon size={12} />
                      </button>
                      {watchlists.length > 1 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(wl.id);
                          }}
                          className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10"
                          title="Delete"
                        >
                          <TrashIcon size={12} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {items.length > 0 ? (
            <span className="text-xs text-text-muted">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size={32} className="text-accent-primary" />
        </div>
      ) : null}

      {/* Items */}
      {!isLoading && items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => {
            const itemKey = `${item.tmdb_id}-${item.media_type}`;
            return (
              <WatchlistItemCard
                key={item.id}
                item={item}
                onFindTorrent={handleFindTorrent}
                onAddMagnet={() => setIsAddModalOpen(true)}
                onRemove={() => handleRemoveItem(item)}
                isRemoving={removingItems.has(itemKey)}
              />
            );
          })}
        </div>
      ) : null}

      {/* Empty State */}
      {!isLoading && items.length === 0 && activeWatchlistId ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MovieIcon size={48} className="text-text-muted mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">No items yet</h2>
          <p className="text-sm text-text-secondary mb-6 max-w-md">
            Browse the Upcoming page to discover movies and TV shows,
            then add them to your watchlist.
          </p>
          <Link
            href="/upcoming"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
          >
            Browse Upcoming
          </Link>
        </div>
      ) : null}

      {/* Add Magnet Modal */}
      <AddMagnetModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}
