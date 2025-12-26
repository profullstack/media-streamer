'use client';

/**
 * Live TV Page
 * 
 * IPTV streaming with M3U playlist support and Xtream Codes integration.
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { TvIcon, PlusIcon, SearchIcon } from '@/components/ui/icons';

interface Channel {
  id: string;
  name: string;
  logo?: string;
  group: string;
  url: string;
}

// Demo channels for UI
const demoChannels: Channel[] = [
  { id: '1', name: 'News 24/7', group: 'News', url: '#' },
  { id: '2', name: 'Sports Live', group: 'Sports', url: '#' },
  { id: '3', name: 'Movie Channel', group: 'Movies', url: '#' },
  { id: '4', name: 'Music TV', group: 'Music', url: '#' },
];

export default function LiveTvPage(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const groups = [...new Set(demoChannels.map(c => c.group))];
  
  const filteredChannels = demoChannels.filter(channel => {
    const matchesSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGroup = !selectedGroup || channel.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

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

        {/* Search and Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search channels..."
              className={cn(
                'w-full rounded-lg border border-border-default bg-bg-secondary py-2 pl-10 pr-4',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
              )}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setSelectedGroup(null)}
              className={cn(
                'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                !selectedGroup
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'
              )}
            >
              All
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
        </div>

        {/* Channels Grid */}
        {filteredChannels.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredChannels.map(channel => (
              <div
                key={channel.id}
                className={cn(
                  'group cursor-pointer rounded-lg border border-border-subtle bg-bg-secondary p-4',
                  'hover:border-accent-primary/50 hover:bg-bg-hover transition-colors'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg-tertiary">
                    <TvIcon size={24} className="text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-text-primary truncate">{channel.name}</h3>
                    <p className="text-sm text-text-muted">{channel.group}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TvIcon size={48} className="text-text-muted mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No channels found</h3>
            <p className="text-sm text-text-secondary max-w-md">
              {searchQuery
                ? 'Try adjusting your search or filters'
                : 'Add an M3U playlist or Xtream Codes provider to get started'}
            </p>
          </div>
        )}

        {/* Add Playlist Modal would go here */}
      </div>
    </MainLayout>
  );
}
