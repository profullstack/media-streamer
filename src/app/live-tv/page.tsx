'use client';

/**
 * Live TV Page
 *
 * IPTV streaming with M3U playlist support and Xtream Codes integration.
 * Features:
 * - Add M3U playlists with name, URL, and optional EPG
 * - Server-side search with word-order-independent matching
 * - Channel icons display
 * - HLS player modal for live streaming
 * - HTTP URL proxying for HTTPS compatibility
 * - Playlist persistence via Supabase (authenticated) or localStorage (guest)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { TvIcon, PlusIcon, SearchIcon, PlayIcon, LoadingSpinner, EditIcon, TrashIcon, HeartFilledIcon } from '@/components/ui/icons';
import { AddPlaylistModal, EditPlaylistModal, HlsPlayerModal, type PlaylistData } from '@/components/live-tv';
import { useAuth } from '@/hooks/use-auth';
import { useIptvChannelFavorites } from '@/hooks/use-favorites';
import type { Channel } from '@/lib/iptv';

/**
 * localStorage key for persisting playlists (guest users only)
 */
const PLAYLISTS_STORAGE_KEY = 'iptv-playlists';

/**
 * localStorage key for persisting active playlist ID (guest users only)
 */
const ACTIVE_PLAYLIST_STORAGE_KEY = 'iptv-active-playlist-id';

interface ChannelsResponse {
  channels: Channel[];
  groups: string[];
  total: number;
  limit: number;
  offset: number;
  cached: boolean;
  fetchedAt: number;
}

/**
 * API response for playlists
 */
interface PlaylistsApiResponse {
  playlists: Array<{
    id: string;
    name: string;
    m3uUrl: string;
    epgUrl?: string;
    isActive: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * Type guard for PlaylistData array from localStorage
 */
function isPlaylistDataArray(data: unknown): data is PlaylistData[] {
  if (!Array.isArray(data)) return false;
  return data.every(item =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as PlaylistData).id === 'string' &&
    typeof (item as PlaylistData).name === 'string' &&
    typeof (item as PlaylistData).m3uUrl === 'string'
  );
}

export default function LiveTvPage(): React.ReactElement {
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const { favorites, refetch: refetchFavorites, isLoading: isFavoritesLoading } = useIptvChannelFavorites();
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  const [isAddPlaylistModalOpen, setIsAddPlaylistModalOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  
  // Edit/Delete state
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingPlaylist, setDeletingPlaylist] = useState<PlaylistData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Channel data state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  
  // Refresh key to force re-fetch (incremented on manual reload)
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Player state
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  
  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if playlist is loaded (to prevent race condition)
  const [isPlaylistLoaded, setIsPlaylistLoaded] = useState(false);
  
  // Track if there are pending filter changes (for TV remote users)
  const hasPendingFilters = searchQuery !== debouncedQuery || pendingGroup !== selectedGroup;

  // Load playlists from API (authenticated) or localStorage (guest)
  useEffect(() => {
    // Wait for auth state to be determined
    if (isAuthLoading) return;

    const loadPlaylists = async (): Promise<void> => {
      if (isLoggedIn) {
        // Load from API for authenticated users
        setIsLoadingPlaylists(true);
        try {
          const response = await fetch('/api/iptv/playlists');
          
          if (response.ok) {
            const data = await response.json() as PlaylistsApiResponse;
            const loadedPlaylists: PlaylistData[] = data.playlists.map(p => ({
              id: p.id,
              name: p.name,
              m3uUrl: p.m3uUrl,
              epgUrl: p.epgUrl,
              isDefault: p.isDefault,
            }));

            setPlaylists(loadedPlaylists);

            // Select default playlist if one exists, otherwise first playlist
            if (loadedPlaylists.length > 0) {
              const defaultPlaylist = loadedPlaylists.find(p => p.isDefault);
              setActivePlaylist(defaultPlaylist ?? loadedPlaylists[0]);
            }
          } else {
            console.error('[Live TV] Failed to load playlists from API');
          }
        } catch (err) {
          console.error('[Live TV] Error loading playlists from API:', err);
        } finally {
          setIsLoadingPlaylists(false);
        }
      } else {
        // Load from localStorage for guest users
        const storedPlaylists = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
        const storedActiveId = localStorage.getItem(ACTIVE_PLAYLIST_STORAGE_KEY);
        
        if (storedPlaylists) {
          try {
            const parsed: unknown = JSON.parse(storedPlaylists);
            if (isPlaylistDataArray(parsed)) {
              setPlaylists(parsed);
              
              // Restore active playlist if it exists
              if (storedActiveId && parsed.length > 0) {
                const activeFromStorage = parsed.find(p => p.id === storedActiveId);
                if (activeFromStorage) {
                  setActivePlaylist(activeFromStorage);
                } else {
                  // If stored active playlist not found, select first one
                  setActivePlaylist(parsed[0]);
                }
              } else if (parsed.length > 0) {
                // No stored active, select first playlist
                setActivePlaylist(parsed[0]);
              }
            }
          } catch (err) {
            console.error('[Live TV] Error loading playlists from localStorage:', err);
          }
        }
      }
      
      setIsInitialized(true);
    };

    void loadPlaylists();
  }, [isLoggedIn, isAuthLoading]);

  // Save playlists to localStorage when they change (guest users only)
  useEffect(() => {
    // Don't save until we've loaded, and only for guest users
    if (!isInitialized || isLoggedIn) return;
    
    localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
  }, [playlists, isInitialized, isLoggedIn]);

  // Save active playlist ID to localStorage when it changes (guest users only)
  useEffect(() => {
    // Don't save until we've loaded, and only for guest users
    if (!isInitialized || isLoggedIn) return;
    
    if (activePlaylist) {
      localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, activePlaylist.id);
    } else {
      localStorage.removeItem(ACTIVE_PLAYLIST_STORAGE_KEY);
    }
  }, [activePlaylist, isInitialized, isLoggedIn]);

  // Debounce search query
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setOffset(0); // Reset pagination on new search
    }, 300);
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  // Fetch channels when playlist, search, group, or refreshKey changes
  // Race condition fix: Only fetch with filters after initial playlist load
  useEffect(() => {
    if (!activePlaylist?.m3uUrl) {
      setChannels([]);
      setGroups([]);
      setTotal(0);
      setHasMore(false);
      setIsPlaylistLoaded(false);
      return;
    }

    // If playlist is not loaded yet and we have filters, skip this fetch
    // The initial load (without filters) will set isPlaylistLoaded to true
    const hasFilters = debouncedQuery || selectedGroup;
    if (!isPlaylistLoaded && hasFilters) {
      return;
    }

    const fetchChannels = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams({
          m3uUrl: activePlaylist.m3uUrl,
          limit: '50',
          offset: String(offset),
        });
        
        if (debouncedQuery) {
          params.set('q', debouncedQuery);
        }
        
        if (selectedGroup) {
          params.set('group', selectedGroup);
        }
        
        const response = await fetch(`/api/iptv/channels?${params.toString()}`);
        
        if (!response.ok) {
          const data = await response.json() as { error?: string };
          throw new Error(data.error ?? 'Failed to fetch channels');
        }
        
        const data = await response.json() as ChannelsResponse;
        
        if (offset === 0) {
          setChannels(data.channels);
        } else {
          setChannels(prev => [...prev, ...data.channels]);
        }
        
        setGroups(data.groups);
        setTotal(data.total);
        setHasMore(offset + data.channels.length < data.total);
        
        // Mark playlist as loaded after successful initial fetch
        if (!isPlaylistLoaded) {
          setIsPlaylistLoaded(true);
        }
      } catch (err) {
        console.error('[Live TV] Error fetching channels:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch channels');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchChannels();
  }, [activePlaylist, debouncedQuery, selectedGroup, offset, refreshKey, isPlaylistLoaded]);

  // Reset offset when group changes
  useEffect(() => {
    setOffset(0);
  }, [selectedGroup]);

  // Apply filters handler (for TV remote users)
  // This forces a reload even if no changes are pending
  const handleApplyFilters = useCallback((): void => {
    // Apply pending group immediately
    setSelectedGroup(pendingGroup);
    // Apply search query immediately (bypass debounce)
    setDebouncedQuery(searchQuery);
    // Reset offset
    setOffset(0);
    // Increment refresh key to force re-fetch even if other values haven't changed
    setRefreshKey(prev => prev + 1);
  }, [pendingGroup, searchQuery]);

  const handleOpenAddPlaylistModal = useCallback((): void => {
    setIsAddPlaylistModalOpen(true);
  }, []);

  const handleCloseAddPlaylistModal = useCallback((): void => {
    setIsAddPlaylistModalOpen(false);
  }, []);

  const handlePlaylistAdded = useCallback((playlist: PlaylistData): void => {
    setPlaylists(prev => [...prev, playlist]);
    // Auto-select the first playlist added
    if (!activePlaylist) {
      setActivePlaylist(playlist);
    }
  }, [activePlaylist]);

  const handleSelectPlaylist = useCallback((playlist: PlaylistData): void => {
    setActivePlaylist(playlist);
    setSelectedGroup(null);
    setPendingGroup(null);
    setSearchQuery('');
    setDebouncedQuery('');
    setOffset(0);
    // Reset playlist loaded state to prevent race condition
    setIsPlaylistLoaded(false);
  }, []);

  const handleChannelClick = useCallback((channel: Channel): void => {
    setSelectedChannel(channel);
    setIsPlayerOpen(true);
  }, []);

  const handleClosePlayer = useCallback((): void => {
    setIsPlayerOpen(false);
    setSelectedChannel(null);
  }, []);

  // Handle favorite toggle - refetch favorites list
  const handleFavoriteToggle = useCallback((): void => {
    void refetchFavorites();
  }, [refetchFavorites]);

  // Play a favorite channel
  const handlePlayFavorite = useCallback((favorite: typeof favorites[0]): void => {
    const channel: Channel = {
      id: favorite.channel_id,
      name: favorite.channel_name,
      url: favorite.channel_url,
      logo: favorite.channel_logo ?? undefined,
      group: favorite.channel_group ?? undefined,
      tvgId: favorite.tvg_id ?? undefined,
      tvgName: favorite.tvg_name ?? undefined,
    };
    setSelectedChannel(channel);
    setIsPlayerOpen(true);
  }, []);

  const handleLoadMore = useCallback((): void => {
    setOffset(prev => prev + 50);
  }, []);

  // Edit playlist handlers
  const handleEditPlaylist = useCallback((playlist: PlaylistData): void => {
    setEditingPlaylist(playlist);
    setIsEditModalOpen(true);
  }, []);

  const handleCloseEditModal = useCallback((): void => {
    setIsEditModalOpen(false);
    setEditingPlaylist(null);
  }, []);

  const handlePlaylistUpdated = useCallback((updatedPlaylist: PlaylistData): void => {
    setPlaylists(prev => prev.map(p => {
      if (p.id === updatedPlaylist.id) {
        return updatedPlaylist;
      }
      // If the updated playlist is now the default, clear isDefault from others
      if (updatedPlaylist.isDefault && p.isDefault) {
        return { ...p, isDefault: false };
      }
      return p;
    }));
    // Update active playlist if it was the one edited
    if (activePlaylist?.id === updatedPlaylist.id) {
      setActivePlaylist(updatedPlaylist);
    }
    setIsEditModalOpen(false);
    setEditingPlaylist(null);
  }, [activePlaylist]);

  // Delete playlist handlers
  const handleDeletePlaylist = useCallback((playlist: PlaylistData): void => {
    setDeletingPlaylist(playlist);
    setDeleteError(null);
  }, []);

  const handleCancelDelete = useCallback((): void => {
    setDeletingPlaylist(null);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (!deletingPlaylist) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      if (isLoggedIn) {
        // Delete from API for authenticated users
        const response = await fetch(`/api/iptv/playlists/${deletingPlaylist.id}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          const data = await response.json() as { error?: string };
          throw new Error(data.error ?? 'Failed to delete playlist');
        }
      }
      
      // Remove from local state
      setPlaylists(prev => prev.filter(p => p.id !== deletingPlaylist.id));
      
      // If deleted playlist was active, select another one
      if (activePlaylist?.id === deletingPlaylist.id) {
        const remaining = playlists.filter(p => p.id !== deletingPlaylist.id);
        setActivePlaylist(remaining.length > 0 ? remaining[0] : null);
      }
      
      setDeletingPlaylist(null);
    } catch (err) {
      console.error('[Live TV] Error deleting playlist:', err);
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete playlist');
    } finally {
      setIsDeleting(false);
    }
  }, [deletingPlaylist, isLoggedIn, activePlaylist, playlists]);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Live TV</h1>
            <p className="text-sm text-text-secondary">
              Stream live channels from your IPTV playlists
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Favorites Toggle */}
            {isLoggedIn && (
              <button
                onClick={() => setShowFavorites(!showFavorites)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2',
                  'transition-colors',
                  showFavorites
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : 'bg-bg-secondary text-text-primary hover:bg-bg-hover border border-border-default'
                )}
              >
                <HeartFilledIcon size={20} />
                <span>Favorites{favorites.length > 0 ? ` (${favorites.length})` : ''}</span>
              </button>
            )}
            <button
              onClick={handleOpenAddPlaylistModal}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2',
                'bg-accent-primary text-white',
                'hover:bg-accent-primary/90 transition-colors'
              )}
            >
              <PlusIcon size={20} />
              <span>Add Playlist</span>
            </button>
          </div>
        </div>

        {/* Playlist Selector - Dropdown with Edit/Delete */}
        {playlists.length > 0 && (
          <div className="flex items-center gap-3">
            <label htmlFor="playlist-select" className="text-sm font-medium text-text-secondary">
              Playlist:
            </label>
            <select
              id="playlist-select"
              value={activePlaylist?.id ?? ''}
              onChange={(e) => {
                const selected = playlists.find(p => p.id === e.target.value);
                if (selected) {
                  handleSelectPlaylist(selected);
                }
              }}
              className={cn(
                'rounded-lg border border-border-default bg-bg-secondary px-4 py-2',
                'text-sm text-text-primary',
                'focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50'
              )}
            >
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
            
            {/* Edit and Delete buttons for active playlist */}
            {activePlaylist ? <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEditPlaylist(activePlaylist)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    'text-text-muted hover:text-text-primary hover:bg-bg-hover',
                    'focus:outline-none focus:ring-2 focus:ring-accent-primary/50'
                  )}
                  title="Edit playlist"
                  aria-label="Edit playlist"
                >
                  <EditIcon size={18} />
                </button>
                <button
                  onClick={() => handleDeletePlaylist(activePlaylist)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    'text-text-muted hover:text-red-400 hover:bg-red-500/10',
                    'focus:outline-none focus:ring-2 focus:ring-red-500/50'
                  )}
                  title="Delete playlist"
                  aria-label="Delete playlist"
                >
                  <TrashIcon size={18} />
                </button>
              </div> : null}
          </div>
        )}

        {/* Favorites Section */}
        {showFavorites && isLoggedIn && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <HeartFilledIcon size={20} className="text-red-400" />
                Favorite Channels
              </h2>
              {isFavoritesLoading && <LoadingSpinner size={16} className="text-red-400" />}
            </div>

            {favorites.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {favorites.map(favorite => (
                  <div
                    key={`${favorite.playlist_id}-${favorite.channel_id}`}
                    onClick={() => handlePlayFavorite(favorite)}
                    className={cn(
                      'group cursor-pointer rounded-lg border border-border-subtle bg-bg-secondary p-3',
                      'hover:border-red-500/50 hover:bg-bg-hover transition-colors'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Channel Logo */}
                      {favorite.channel_logo ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-tertiary overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element -- External IPTV channel logos with onError fallback */}
                          <img
                            src={favorite.channel_logo}
                            alt={`${favorite.channel_name} logo`}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              const parent = (e.target as HTMLImageElement).parentElement;
                              if (parent) {
                                parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>';
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-tertiary">
                          <TvIcon size={20} className="text-text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-text-primary text-sm truncate">{favorite.channel_name}</h3>
                        {favorite.channel_group ? <p className="text-xs text-text-muted truncate">{favorite.channel_group}</p> : null}
                      </div>
                      {/* Play indicator on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <PlayIcon size={16} className="text-red-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <HeartFilledIcon size={32} className="mx-auto text-text-muted mb-2" />
                <p className="text-sm text-text-secondary">
                  No favorite channels yet. Click the heart icon on a channel to add it to your favorites.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deletingPlaylist ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-bg-primary border border-border-default rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Delete Playlist
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                Are you sure you want to delete &quot;{deletingPlaylist.name}&quot;? This action cannot be undone.
              </p>
              {deleteError ? <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
                  {deleteError}
                </div> : null}
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                  className={cn(
                    'px-4 py-2 rounded-lg transition-colors',
                    'bg-bg-secondary text-text-primary',
                    'hover:bg-bg-hover',
                    'disabled:opacity-50'
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleConfirmDelete()}
                  disabled={isDeleting}
                  className={cn(
                    'px-4 py-2 rounded-lg transition-colors',
                    'bg-red-500 text-white',
                    'hover:bg-red-600',
                    'disabled:opacity-50 flex items-center gap-2'
                  )}
                >
                  {isDeleting ? (
                    <>
                      <LoadingSpinner size={16} />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete</span>
                  )}
                </button>
              </div>
            </div>
          </div> : null}

        {/* Search and Filters */}
        <div className="space-y-4">
          {/* Search Input - Full Width */}
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search channels... (e.g., 'espn hd' or 'hd espn')"
              className={cn(
                'w-full rounded-xl border border-border-default bg-bg-secondary py-4 pl-12 pr-12',
                'text-base text-text-primary placeholder:text-text-muted',
                'focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50'
              )}
            />
            {/* Loading indicator while searching */}
            {isLoading && searchQuery ? <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <LoadingSpinner size={20} className="text-accent-primary" />
              </div> : null}
            {/* Clear button when there's a query */}
            {searchQuery && !isLoading ? <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button> : null}
          </div>
          
          {/* Search hint */}
          {activePlaylist ? <p className="text-xs text-text-muted">
              Search is case-insensitive and matches words in any order.
            </p> : null}
          
          {/* Group Filter - Dropdown */}
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="group-select" className="text-sm font-medium text-text-secondary">
                Group:
              </label>
              <select
                id="group-select"
                value={pendingGroup ?? ''}
                onChange={(e) => setPendingGroup(e.target.value || null)}
                className={cn(
                  'rounded-lg border border-border-default bg-bg-secondary px-4 py-2',
                  'text-sm text-text-primary',
                  'focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
                  // Highlight when pending change
                  pendingGroup !== selectedGroup && 'border-yellow-500/50 ring-1 ring-yellow-500/30'
                )}
              >
                <option value="">All Groups ({groups.length})</option>
                {groups.map(group => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Static Submit Button - Always visible when playlist is active (essential for TV remote) */}
          {activePlaylist ? <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleApplyFilters}
                disabled={isLoading}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-6 py-3',
                  'text-sm font-medium transition-colors',
                  'bg-accent-primary text-white hover:bg-accent-primary/90',
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
                  'disabled:opacity-50'
                )}
                aria-label="Apply search and group filters"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size={16} />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <SearchIcon size={16} />
                    <span>Search / Reload</span>
                  </>
                )}
              </button>
              
              {/* Pending changes indicator */}
              {hasPendingFilters && !isLoading ? <span className="text-xs text-yellow-500">
                  Pending changes - press button to apply
                </span> : null}
            </div> : null}
        </div>

        {/* Error Message */}
        {error ? <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
            {error}
          </div> : null}

        {/* Loading State - Playlists */}
        {(isAuthLoading || isLoadingPlaylists) ? <div className="flex flex-col items-center justify-center py-16">
            <LoadingSpinner size={48} className="text-accent-primary mb-4" />
            <p className="text-sm text-text-secondary">Loading playlists...</p>
          </div> : null}

        {/* Loading State - Channels */}
        {isLoading && channels.length === 0 && !isAuthLoading && !isLoadingPlaylists ? <div className="flex flex-col items-center justify-center py-16">
            <LoadingSpinner size={48} className="text-accent-primary mb-4" />
            <p className="text-sm text-text-secondary">Loading channels...</p>
          </div> : null}

        {/* Channels Grid */}
        {channels.length > 0 ? (
          <>
            <div className="text-sm text-text-muted mb-2">
              Showing {channels.length} of {total} channels
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {channels.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => handleChannelClick(channel)}
                  className={cn(
                    'group cursor-pointer rounded-lg border border-border-subtle bg-bg-secondary p-4',
                    'hover:border-accent-primary/50 hover:bg-bg-hover transition-colors'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Channel Logo */}
                    {channel.logo ? (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg-tertiary overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- External IPTV channel logos with onError fallback */}
                        <img
                          src={channel.logo}
                          alt={`${channel.name} logo`}
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            // Replace with placeholder on error
                            (e.target as HTMLImageElement).style.display = 'none';
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent) {
                              parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>';
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg-tertiary">
                        <TvIcon size={24} className="text-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-text-primary truncate">{channel.name}</h3>
                      {channel.group ? <p className="text-sm text-text-muted truncate">{channel.group}</p> : null}
                    </div>
                    {/* Play indicator on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <PlayIcon size={20} className="text-accent-primary" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Load More Button */}
            {hasMore ? <div className="flex justify-center pt-4">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-6 py-2',
                    'bg-bg-secondary text-text-primary',
                    'hover:bg-bg-hover transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isLoading ? (
                    <>
                      <LoadingSpinner size={16} />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <span>Load More</span>
                  )}
                </button>
              </div> : null}
          </>
        ) : !isLoading && !error && !isAuthLoading && !isLoadingPlaylists && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TvIcon size={48} className="text-text-muted mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">
              {activePlaylist ? 'No channels found' : 'No playlist selected'}
            </h3>
            <p className="text-sm text-text-secondary max-w-md">
              {activePlaylist
                ? searchQuery
                  ? 'Try adjusting your search or filters'
                  : 'This playlist appears to be empty'
                : isLoggedIn
                  ? 'Add an M3U playlist to get started. Your playlists will be saved to your account.'
                  : 'Add an M3U playlist to get started. Sign in to save playlists across devices.'}
            </p>
            {!activePlaylist && (
              <button
                onClick={handleOpenAddPlaylistModal}
                className={cn(
                  'mt-4 flex items-center gap-2 rounded-lg px-4 py-2',
                  'bg-accent-primary text-white',
                  'hover:bg-accent-primary/90 transition-colors'
                )}
              >
                <PlusIcon size={20} />
                <span>Add Playlist</span>
              </button>
            )}
          </div>
        )}

        {/* Add Playlist Modal */}
        <AddPlaylistModal
          isOpen={isAddPlaylistModalOpen}
          onClose={handleCloseAddPlaylistModal}
          onSuccess={handlePlaylistAdded}
        />

        {/* HLS Player Modal */}
        {selectedChannel ? <HlsPlayerModal
            isOpen={isPlayerOpen}
            onClose={handleClosePlayer}
            channel={selectedChannel}
            playlistId={activePlaylist?.id}
            initialFavorited={favorites.some(
              f => f.playlist_id === activePlaylist?.id && f.channel_id === selectedChannel.id
            )}
            onFavoriteToggle={handleFavoriteToggle}
          /> : null}

        {/* Edit Playlist Modal */}
        <EditPlaylistModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          playlist={editingPlaylist}
          onSuccess={handlePlaylistUpdated}
        />
      </div>
    </MainLayout>
  );
}
