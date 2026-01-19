'use client';

/**
 * Library Content Component
 *
 * Client component for interactive library features.
 * Receives initial data from server component.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  HeartIcon,
  HeartFilledIcon,
  MusicIcon,
  VideoIcon,
  BookIcon,
  FolderIcon,
  PlayIcon,
  CloseIcon,
  TvIcon,
} from '@/components/ui/icons';
import { HlsPlayerModal } from '@/components/live-tv';
import type { Channel } from '@/lib/iptv';
import type {
  Favorite,
  Collection,
  HistoryItem,
  CollectionType,
} from '@/lib/library';
import type { TorrentFavoriteWithDetails, IptvChannelFavoriteWithDetails } from '@/lib/favorites';

type TabType = 'favorites' | 'collections' | 'history';
type MediaType = 'all' | 'music' | 'video' | 'ebook' | 'livetv';

interface LibraryContentProps {
  initialFavorites: Favorite[];
  initialCollections: Collection[];
  initialHistory: HistoryItem[];
  initialTorrentFavorites: TorrentFavoriteWithDetails[];
  initialIptvChannelFavorites: IptvChannelFavoriteWithDetails[];
}

function getMediaIcon(
  type: 'audio' | 'video' | 'ebook' | string | null | undefined
): React.ReactElement {
  switch (type) {
    case 'audio':
      return <MusicIcon size={16} />;
    case 'video':
      return <VideoIcon size={16} />;
    case 'ebook':
      return <BookIcon size={16} />;
    default:
      return <FolderIcon size={16} />;
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export function LibraryContent({
  initialFavorites,
  initialCollections,
  initialHistory,
  initialTorrentFavorites,
  initialIptvChannelFavorites,
}: LibraryContentProps): React.ReactElement {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('favorites');
  const [mediaFilter, setMediaFilter] = useState<MediaType>('all');
  const [favorites, setFavorites] = useState<Favorite[]>(initialFavorites);
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [torrentFavorites, setTorrentFavorites] = useState<TorrentFavoriteWithDetails[]>(initialTorrentFavorites);
  const [iptvChannelFavorites, setIptvChannelFavorites] = useState<IptvChannelFavoriteWithDetails[]>(initialIptvChannelFavorites);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionType, setNewCollectionType] = useState<CollectionType>('mixed');

  // IPTV Player state
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedChannelPlaylistId, setSelectedChannelPlaylistId] = useState<string | undefined>(undefined);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const filteredFavorites = favorites.filter((item) => {
    if (mediaFilter === 'all') return true;
    if (mediaFilter === 'livetv') return false;
    const category = item.torrent_files?.media_category;
    if (mediaFilter === 'music') return category === 'audio';
    if (mediaFilter === 'video') return category === 'video';
    if (mediaFilter === 'ebook') return category === 'ebook';
    return true;
  });

  const filteredHistory = history.filter((item) => {
    if (mediaFilter === 'all') return true;
    if (mediaFilter === 'livetv') return false;
    const category = item.file?.media_category;
    if (mediaFilter === 'music') return category === 'audio';
    if (mediaFilter === 'video') return category === 'video';
    if (mediaFilter === 'ebook') return category === 'ebook';
    return true;
  });

  const filteredTorrentFavorites = torrentFavorites.filter((item) => {
    if (mediaFilter === 'all') return true;
    if (mediaFilter === 'livetv') return false;
    const contentType = item.torrents?.content_type;
    if (mediaFilter === 'music') return contentType === 'music';
    if (mediaFilter === 'video') return contentType === 'movie' || contentType === 'tvshow';
    if (mediaFilter === 'ebook') return contentType === 'book';
    return true;
  });

  const removeFavorite = useCallback(async (fileId: string): Promise<void> => {
    try {
      const response = await fetch('/api/library/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });

      if (response.ok) {
        setFavorites((prev) => prev.filter((item) => item.file_id !== fileId));
      }
    } catch (error) {
      console.error('Failed to remove favorite:', error);
    }
  }, []);

  const removeTorrentFavorite = useCallback(async (torrentId: string): Promise<void> => {
    try {
      const response = await fetch('/api/favorites/torrents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ torrentId }),
      });

      if (response.ok) {
        setTorrentFavorites((prev) => prev.filter((item) => item.torrent_id !== torrentId));
      }
    } catch (error) {
      console.error('Failed to remove torrent favorite:', error);
    }
  }, []);

  const removeIptvChannelFavorite = useCallback(async (playlistId: string, channelId: string): Promise<void> => {
    try {
      const response = await fetch('/api/favorites/iptv-channels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, channelId }),
      });

      if (response.ok) {
        setIptvChannelFavorites((prev) => prev.filter((item) =>
          !(item.playlist_id === playlistId && item.channel_id === channelId)
        ));
      }
    } catch (error) {
      console.error('Failed to remove IPTV channel favorite:', error);
    }
  }, []);

  // Play an IPTV channel favorite
  const handlePlayChannel = useCallback((favorite: IptvChannelFavoriteWithDetails): void => {
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
    setSelectedChannelPlaylistId(favorite.playlist_id);
    setIsPlayerOpen(true);
  }, []);

  const handleClosePlayer = useCallback((): void => {
    setIsPlayerOpen(false);
    setSelectedChannel(null);
    setSelectedChannelPlaylistId(undefined);
  }, []);

  // Handle favorite toggle from modal - remove from local state if unfavorited
  const handleFavoriteToggle = useCallback((channelId: string, isFavorited: boolean): void => {
    if (!isFavorited && selectedChannelPlaylistId) {
      setIptvChannelFavorites((prev) => prev.filter((item) =>
        !(item.playlist_id === selectedChannelPlaylistId && item.channel_id === channelId)
      ));
    }
  }, [selectedChannelPlaylistId]);

  // Handle play/read action for file favorites
  const handleFileAction = useCallback((item: Favorite): void => {
    const mediaCategory = item.torrent_files?.media_category;
    const fileId = item.file_id;

    if (mediaCategory === 'ebook') {
      // Navigate to ebook reader
      router.push(`/reader/${fileId}`);
    } else {
      // Navigate to torrent details page for audio/video
      const infohash = item.torrent_files?.torrents?.infohash;
      if (infohash) {
        router.push(`/torrents/${infohash}`);
      }
    }
  }, [router]);

  const createCollection = useCallback(async (): Promise<void> => {
    if (!newCollectionName.trim()) return;

    try {
      const response = await fetch('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCollectionName,
          type: newCollectionType,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { collection: Collection };
        setCollections((prev) => [data.collection, ...prev]);
        setNewCollectionName('');
        setIsCreatingCollection(false);
      }
    } catch (error) {
      console.error('Failed to create collection:', error);
    }
  }, [newCollectionName, newCollectionType]);

  const clearHistory = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/library/history', {
        method: 'DELETE',
      });

      if (response.ok) {
        setHistory([]);
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }, []);

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'favorites', label: 'Favorites', count: favorites.length + torrentFavorites.length + iptvChannelFavorites.length },
    { id: 'collections', label: 'Collections', count: collections.length },
    { id: 'history', label: 'History', count: history.length },
  ];

  const mediaFilters: { id: MediaType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'music', label: 'Music' },
    { id: 'video', label: 'Videos' },
    { id: 'ebook', label: 'Ebooks' },
    { id: 'livetv', label: 'Live TV' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">My Library</h1>
        <p className="text-text-secondary mt-1">
          Your favorites, collections, and watch history
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-default">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors relative',
              activeTab === tab.id
                ? 'text-accent-primary'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {tab.label}
            <span className="ml-2 text-xs text-text-muted">({tab.count})</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Media Type Filter */}
      {(activeTab === 'favorites' || activeTab === 'history') && (
        <div className="flex gap-2">
          {mediaFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setMediaFilter(filter.id)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full transition-colors',
                mediaFilter === filter.id
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}

      {/* Favorites Tab */}
      {activeTab === 'favorites' && (
        <div className="space-y-6">
          {/* Torrent Favorites Section */}
          {filteredTorrentFavorites.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider flex items-center gap-2">
                <HeartFilledIcon size={14} className="text-red-400" />
                Favorite Torrents ({filteredTorrentFavorites.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTorrentFavorites.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors group"
                  >
                    {/* Poster/Cover */}
                    {item.torrents?.poster_url || item.torrents?.cover_url ? (
                      <div className="w-16 h-20 rounded-lg bg-bg-tertiary overflow-hidden flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.torrents?.poster_url ?? item.torrents?.cover_url ?? ''}
                          alt={item.torrents?.name ?? 'Torrent'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-20 rounded-lg bg-bg-tertiary flex items-center justify-center flex-shrink-0">
                        <FolderIcon size={24} className="text-text-muted" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/torrents/${item.torrents?.infohash}`}
                        className="font-medium text-text-primary hover:text-accent-primary truncate block"
                      >
                        {item.torrents?.name ?? 'Unknown Torrent'}
                      </Link>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-text-muted">
                        {item.torrents?.content_type && (
                          <span className="px-2 py-0.5 rounded bg-bg-tertiary">
                            {item.torrents.content_type}
                          </span>
                        )}
                        {item.torrents?.year && (
                          <span>{item.torrents.year}</span>
                        )}
                        {item.torrents?.file_count && (
                          <span>{item.torrents.file_count} files</span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-1">
                        Added {formatTimeAgo(item.created_at)}
                      </p>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeTorrentFavorite(item.torrent_id)}
                      className="p-1.5 rounded-full bg-bg-tertiary text-text-secondary hover:text-status-error hover:bg-status-error/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove from favorites"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Favorites Section */}
          {filteredFavorites.length > 0 && mediaFilter !== 'livetv' && (
            <div className="space-y-2">
              {(torrentFavorites.length > 0 || iptvChannelFavorites.length > 0) && (
                <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider">
                  Favorite Files ({filteredFavorites.length})
                </h3>
              )}
              {filteredFavorites.map((item) => {
                const isEbook = item.torrent_files?.media_category === 'ebook';
                const infohash = item.torrent_files?.torrents?.infohash;

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors group"
                  >
                    {/* Thumbnail placeholder */}
                    <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center text-text-muted">
                      {getMediaIcon(item.torrent_files?.media_category)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {infohash ? (
                        <Link
                          href={`/torrents/${infohash}`}
                          className="font-medium text-text-primary hover:text-accent-primary truncate block"
                        >
                          {item.torrent_files?.name ?? 'Unknown'}
                        </Link>
                      ) : (
                        <h3 className="font-medium text-text-primary truncate">
                          {item.torrent_files?.name ?? 'Unknown'}
                        </h3>
                      )}
                      {infohash ? (
                        <Link
                          href={`/torrents/${infohash}`}
                          className="text-sm text-text-secondary hover:text-accent-primary truncate block"
                        >
                          {item.torrent_files?.torrents?.name ?? 'Unknown torrent'}
                        </Link>
                      ) : (
                        <p className="text-sm text-text-secondary truncate">
                          {item.torrent_files?.torrents?.name ?? 'Unknown torrent'}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleFileAction(item)}
                        className={cn(
                          'p-2 rounded-full text-white hover:opacity-80',
                          isEbook ? 'bg-accent-ebook' : 'bg-accent-primary'
                        )}
                        title={isEbook ? 'Read' : 'Play'}
                      >
                        {isEbook ? <BookIcon size={16} /> : <PlayIcon size={16} />}
                      </button>
                      <button
                        onClick={() => removeFavorite(item.file_id)}
                        className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:text-status-error hover:bg-status-error/10"
                        title="Remove from favorites"
                      >
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* IPTV Channel Favorites Section */}
          {iptvChannelFavorites.length > 0 && (mediaFilter === 'all' || mediaFilter === 'livetv') && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider flex items-center gap-2">
                <TvIcon size={14} className="text-accent-primary" />
                Live TV Channels ({iptvChannelFavorites.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {iptvChannelFavorites.map((item) => (
                  <div
                    key={`${item.playlist_id}-${item.channel_id}`}
                    className="flex items-center gap-3 p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors group"
                  >
                    {/* Channel Logo */}
                    {item.channel_logo ? (
                      <div className="w-12 h-12 rounded-lg bg-bg-tertiary overflow-hidden flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.channel_logo}
                          alt={item.channel_name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center flex-shrink-0">
                        <TvIcon size={24} className="text-text-muted" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-text-primary truncate">
                        {item.channel_name}
                      </h3>
                      {item.iptv_playlists?.name ? <p className="text-xs text-text-muted truncate">{item.iptv_playlists.name}</p> : null}
                      {item.channel_group ? <p className="text-sm text-text-secondary truncate">{item.channel_group}</p> : null}
                      <p className="text-xs text-text-muted mt-1">
                        Added {formatTimeAgo(item.created_at)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePlayChannel(item)}
                        className="p-2 rounded-full bg-accent-primary text-white hover:bg-accent-primary/80"
                        title="Play channel"
                      >
                        <PlayIcon size={16} />
                      </button>
                      <button
                        onClick={() => removeIptvChannelFavorite(item.playlist_id, item.channel_id)}
                        className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:text-status-error hover:bg-status-error/10"
                        title="Remove from favorites"
                      >
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {torrentFavorites.length === 0 && filteredFavorites.length === 0 && iptvChannelFavorites.length === 0 && (
            <div className="text-center py-12">
              <HeartIcon className="mx-auto text-text-muted mb-4" size={48} />
              <h3 className="text-lg font-medium text-text-primary mb-2">
                No favorites yet
              </h3>
              <p className="text-text-secondary">
                Click the heart icon on any torrent or media to add it to your favorites
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collections Tab */}
      {activeTab === 'collections' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center text-text-muted mb-3">
                <FolderIcon size={24} />
              </div>
              <h3 className="font-medium text-text-primary">{collection.name}</h3>
              <p className="text-sm text-text-secondary">
                {collection.item_count ?? 0} items
              </p>
            </div>
          ))}

          {/* Add Collection Button */}
          {isCreatingCollection ? (
            <div className="p-4 rounded-lg border-2 border-accent-primary bg-bg-secondary">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name"
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default text-text-primary placeholder:text-text-muted mb-2"
                autoFocus
              />
              <select
                value={newCollectionType}
                onChange={(e) => setNewCollectionType(e.target.value as CollectionType)}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default text-text-primary mb-3"
              >
                <option value="mixed">Mixed</option>
                <option value="playlist">Playlist (Music)</option>
                <option value="watchlist">Watchlist (Videos)</option>
                <option value="reading_list">Reading List (Ebooks)</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={createCollection}
                  className="flex-1 px-3 py-2 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-primary/90"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreatingCollection(false);
                    setNewCollectionName('');
                  }}
                  className="px-3 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-sm font-medium hover:bg-bg-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingCollection(true)}
              className="p-4 rounded-lg border-2 border-dashed border-border-default hover:border-accent-primary transition-colors flex flex-col items-center justify-center min-h-[120px]"
            >
              <div className="w-12 h-12 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted mb-2">
                <span className="text-2xl">+</span>
              </div>
              <span className="text-sm text-text-secondary">New Collection</span>
            </button>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12">
              <PlayIcon className="mx-auto text-text-muted mb-4" size={48} />
              <h3 className="text-lg font-medium text-text-primary mb-2">
                No watch history
              </h3>
              <p className="text-text-secondary">
                Start streaming to build your history
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider">
                  Recently Played
                </h3>
                <button
                  onClick={clearHistory}
                  className="text-sm text-accent-primary hover:text-accent-primary/80"
                >
                  Clear History
                </button>
              </div>
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors group"
                >
                  {/* Thumbnail placeholder */}
                  <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center text-text-muted">
                    {getMediaIcon(item.file?.media_category)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-text-primary truncate">
                      {item.file?.name ?? 'Unknown'}
                    </h3>
                    <p className="text-sm text-text-secondary truncate">
                      {item.type === 'watch'
                        ? `${formatDuration(item.current_time_seconds)} / ${formatDuration(item.duration_seconds)}`
                        : `Page ${item.current_page} of ${item.total_pages}`}
                      {' • '}
                      {item.percentage}% complete
                      {' • '}
                      {formatTimeAgo(item.last_activity_at)}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-24 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-primary"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>

                  {/* Play button */}
                  <button
                    className="p-2 rounded-full bg-accent-primary text-white hover:bg-accent-primary/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Continue"
                  >
                    <PlayIcon size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* HLS Player Modal for IPTV channels */}
      {selectedChannel ? (
        <HlsPlayerModal
          isOpen={isPlayerOpen}
          onClose={handleClosePlayer}
          channel={selectedChannel}
          playlistId={selectedChannelPlaylistId}
          initialFavorited={true}
          onFavoriteToggle={handleFavoriteToggle}
        />
      ) : null}
    </div>
  );
}
