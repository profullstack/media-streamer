'use client';

/**
 * Torrent List Component
 * 
 * Displays a list of torrents with status, size, and file count
 */

import React from 'react';
import { formatBytes } from '@/lib/utils';

export interface TorrentItem {
  id: string;
  infohash: string;
  name: string;
  total_size: number;
  file_count: number;
  status: string;
  created_at: string;
}

export interface TorrentListProps {
  torrents: TorrentItem[];
  onSelect: (torrent: TorrentItem) => void;
  selectedId?: string;
  onExpand?: (torrent: TorrentItem) => void;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'indexed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'indexing':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'error':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export function TorrentList({ torrents, onSelect, selectedId, onExpand }: TorrentListProps): React.ReactElement {
  return (
    <div className="space-y-2">
      {torrents.map((torrent) => (
        <div
          key={torrent.id}
          data-testid="torrent-item"
          className={`cursor-pointer rounded-lg border p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
            selectedId === torrent.id
              ? 'selected border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700'
          }`}
          onClick={() => onSelect(torrent)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {torrent.name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{torrent.file_count} files</span>
                <span>•</span>
                <span>{formatBytes(torrent.total_size)}</span>
                <span>•</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(torrent.status)}`}>
                  {torrent.status}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand?.(torrent);
              }}
              aria-label="Expand torrent"
              className="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
