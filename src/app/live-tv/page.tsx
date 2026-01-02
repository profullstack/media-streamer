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
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { TvIcon, PlusIcon, SearchIcon, PlayIcon, LoadingSpinner } from '@/components/ui/icons';
import { AddPlaylistModal, HlsPlayerModal, type PlaylistData } from '@/components/live-tv';
import type { Channel } from '@/lib/iptv';

interface ChannelsResponse {
  channels: Channel[];
  groups: string[];
  total: number;
  limit: number;
  offset: number;
  cached: boolean;
  fetchedAt: number;
}

export default function LiveTvPage(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isAddPlaylistModalOpen, setIsAddPlaylistModalOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistData | null>(null);
  
  // Channel data state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  
  // Player state
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  
  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Fetch channels when playlist, search, or group changes
  useEffect(() => {
    if (!activePlaylist?.m3uUrl) {
      setChannels([]);
      setGroups([]);
      setTotal(0);
      setHasMore(false);
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
      } catch (err) {
        console.error('[Live TV] Error fetching channels:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch channels');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchChannels();
  }, [activePlaylist, debouncedQuery, selectedGroup, offset]);

  // Reset offset when group changes
  useEffect(() => {
    setOffset(0);
  }, [selectedGroup]);

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
    setSearchQuery('');
    setOffset(0);
  }, []);

  const handleChannelClick = useCallback((channel: Channel): void => {
    setSelectedChannel(channel);
    setIsPlayerOpen(true);
  }, []);

  const handleClosePlayer = useCallback((): void => {
    setIsPlayerOpen(false);
    setSelectedChannel(null);
  }, []);

  const handleLoadMore = useCallback((): void => {
    setOffset(prev => prev + 50);
  }, []);

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

        {/* Playlist Selector */}
        {playlists.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {playlists.map((playlist, index) => (
              <button
                key={`${playlist.name}-${index}`}
                onClick={() => handleSelectPlaylist(playlist)}
                className={cn(
                  'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  activePlaylist === playlist
                    ? 'bg-accent-primary text-white'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'
                )}
              >
                {playlist.name}
              </button>
            ))}
          </div>
        )}

        {/* Search and Filters */}
        <div className="space-y-4">
          {/* Search Input - Full Width */}
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
            <input
              type="search"
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
            {isLoading && searchQuery && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <LoadingSpinner size={20} className="text-accent-primary" />
              </div>
            )}
            {/* Clear button when there's a query */}
            {searchQuery && !isLoading && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Search hint */}
          {activePlaylist && (
            <p className="text-xs text-text-muted">
              Search is case-insensitive and matches words in any order. Results update automatically as you type.
            </p>
          )}
          
          {/* Group Filters */}
          {groups.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedGroup(null)}
                className={cn(
                  'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  !selectedGroup
                    ? 'bg-accent-primary text-white'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'
                )}
              >
                All Groups
              </button>
              {groups.map(group => (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    selectedGroup === group
                      ? 'bg-accent-primary text-white'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'
                  )}
                >
                  {group}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && channels.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <LoadingSpinner size={48} className="text-accent-primary mb-4" />
            <p className="text-sm text-text-secondary">Loading channels...</p>
          </div>
        )}

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
                      {channel.group && (
                        <p className="text-sm text-text-muted truncate">{channel.group}</p>
                      )}
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
            {hasMore && (
              <div className="flex justify-center pt-4">
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
              </div>
            )}
          </>
        ) : !isLoading && !error && (
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
                : 'Add an M3U playlist to get started'}
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
        {selectedChannel && (
          <HlsPlayerModal
            isOpen={isPlayerOpen}
            onClose={handleClosePlayer}
            channel={selectedChannel}
          />
        )}
      </div>
    </MainLayout>
  );
}
