'use client';

/**
 * Torrent Search Component
 *
 * Search input with scope selector and media type filter
 */

import React, { useState, useCallback, useEffect } from 'react';

export interface SearchOptions {
  scope?: 'all' | 'current';
  torrentId?: string;
  mediaType?: string;
}

export interface TorrentSearchProps {
  onSearch: (query: string, options?: SearchOptions) => void;
  torrentId?: string;
}

export function TorrentSearch({ onSearch, torrentId }: TorrentSearchProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [mediaType, setMediaType] = useState<string>('');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        const options: SearchOptions = { scope };
        if (scope === 'current' && torrentId) {
          options.torrentId = torrentId;
        }
        if (mediaType) {
          options.mediaType = mediaType;
        }
        onSearch(query, options);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, scope, mediaType, torrentId, onSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    onSearch('');
  }, [onSearch]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search torrents and files..."
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        {query && (
          <button
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as 'all' | 'current')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All Torrents</option>
          <option value="current">Current Torrent</option>
        </select>

        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value)}
          aria-label="Media type"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="">All Types</option>
          <option value="audio">Audio</option>
          <option value="video">Video</option>
          <option value="ebook">Ebook</option>
          <option value="document">Document</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
  );
}
