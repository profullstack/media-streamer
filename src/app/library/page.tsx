'use client';

/**
 * My Library Page
 * 
 * Shows user's favorites, collections, and watch history.
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  HeartIcon,
  MusicIcon,
  VideoIcon,
  BookIcon,
  FolderIcon,
  PlayIcon,
  CloseIcon,
} from '@/components/ui/icons';

type TabType = 'favorites' | 'collections' | 'history';
type MediaType = 'all' | 'music' | 'video' | 'ebook';

interface MediaItem {
  id: string;
  title: string;
  type: 'music' | 'video' | 'ebook';
  artist?: string;
  thumbnail?: string;
  duration?: string;
  addedAt: Date;
}

// Mock data for demonstration
const mockFavorites: MediaItem[] = [
  {
    id: '1',
    title: 'Selected Ambient Works 85-92',
    type: 'music',
    artist: 'Aphex Twin',
    duration: '74:23',
    addedAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    title: 'Blade Runner 2049',
    type: 'video',
    duration: '2:44:00',
    addedAt: new Date('2024-01-10'),
  },
  {
    id: '3',
    title: 'Neuromancer',
    type: 'ebook',
    artist: 'William Gibson',
    addedAt: new Date('2024-01-05'),
  },
  {
    id: '4',
    title: 'Discovery',
    type: 'music',
    artist: 'Daft Punk',
    duration: '60:47',
    addedAt: new Date('2024-01-01'),
  },
];

const mockCollections = [
  { id: '1', name: 'Chill Vibes', count: 24, type: 'music' as const },
  { id: '2', name: 'Sci-Fi Movies', count: 12, type: 'video' as const },
  { id: '3', name: 'Reading List', count: 8, type: 'ebook' as const },
];

const mockHistory: MediaItem[] = [
  {
    id: '5',
    title: 'Windowlicker',
    type: 'music',
    artist: 'Aphex Twin',
    duration: '6:07',
    addedAt: new Date(),
  },
  {
    id: '6',
    title: 'The Matrix',
    type: 'video',
    duration: '2:16:00',
    addedAt: new Date(Date.now() - 86400000),
  },
];

function getMediaIcon(type: 'music' | 'video' | 'ebook'): React.ReactElement {
  switch (type) {
    case 'music':
      return <MusicIcon size={16} />;
    case 'video':
      return <VideoIcon size={16} />;
    case 'ebook':
      return <BookIcon size={16} />;
  }
}

export default function LibraryPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabType>('favorites');
  const [mediaFilter, setMediaFilter] = useState<MediaType>('all');
  const [favorites, setFavorites] = useState<MediaItem[]>(mockFavorites);

  const filteredFavorites = favorites.filter(
    (item) => mediaFilter === 'all' || item.type === mediaFilter
  );

  const filteredHistory = mockHistory.filter(
    (item) => mediaFilter === 'all' || item.type === mediaFilter
  );

  const removeFavorite = (id: string): void => {
    setFavorites((prev) => prev.filter((item) => item.id !== id));
  };

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'favorites', label: 'Favorites', count: favorites.length },
    { id: 'collections', label: 'Collections', count: mockCollections.length },
    { id: 'history', label: 'History', count: mockHistory.length },
  ];

  const mediaFilters: { id: MediaType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'music', label: 'Music' },
    { id: 'video', label: 'Videos' },
    { id: 'ebook', label: 'Ebooks' },
  ];

  return (
    <MainLayout>
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

        {/* Content */}
        {activeTab === 'favorites' && (
          <div className="space-y-2">
            {filteredFavorites.length === 0 ? (
              <div className="text-center py-12">
                <HeartIcon className="mx-auto text-text-muted mb-4" size={48} />
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  No favorites yet
                </h3>
                <p className="text-text-secondary">
                  Click the heart icon on any media to add it to your favorites
                </p>
              </div>
            ) : (
              filteredFavorites.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors group"
                >
                  {/* Thumbnail placeholder */}
                  <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center text-text-muted">
                    {getMediaIcon(item.type)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-text-primary truncate">
                      {item.title}
                    </h3>
                    <p className="text-sm text-text-secondary truncate">
                      {item.artist || item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      {item.duration ? ` • ${item.duration}` : null}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-2 rounded-full bg-accent-primary text-white hover:bg-accent-primary/80"
                      title="Play"
                    >
                      <PlayIcon size={16} />
                    </button>
                    <button
                      onClick={() => removeFavorite(item.id)}
                      className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:text-status-error hover:bg-status-error/10"
                      title="Remove from favorites"
                    >
                      <CloseIcon size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'collections' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockCollections.map((collection) => (
              <div
                key={collection.id}
                className="p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex items-center justify-center text-text-muted mb-3">
                  <FolderIcon size={24} />
                </div>
                <h3 className="font-medium text-text-primary">{collection.name}</h3>
                <p className="text-sm text-text-secondary">
                  {collection.count} items
                </p>
              </div>
            ))}

            {/* Add Collection Button */}
            <button className="p-4 rounded-lg border-2 border-dashed border-border-default hover:border-accent-primary transition-colors flex flex-col items-center justify-center min-h-[120px]">
              <div className="w-12 h-12 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted mb-2">
                <span className="text-2xl">+</span>
              </div>
              <span className="text-sm text-text-secondary">New Collection</span>
            </button>
          </div>
        )}

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
                  <button className="text-sm text-accent-primary hover:text-accent-primary/80">
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
                      {getMediaIcon(item.type)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-text-primary truncate">
                        {item.title}
                      </h3>
                      <p className="text-sm text-text-secondary truncate">
                        {item.artist || item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                        {item.duration ? ` • ${item.duration}` : null}
                      </p>
                    </div>

                    {/* Play button */}
                    <button
                      className="p-2 rounded-full bg-accent-primary text-white hover:bg-accent-primary/80 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Play again"
                    >
                      <PlayIcon size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
