'use client';

/**
 * Torrent List Component
 *
 * Displays a list of torrents with status, size, file count, and poster images
 */

import React from 'react';
import Image from 'next/image';
import { formatBytes } from '@/lib/utils';

export interface TorrentItem {
  id: string;
  infohash: string;
  name: string;
  // camelCase fields from API transform
  cleanTitle?: string | null;
  totalSize: number;
  fileCount: number;
  status?: string;
  createdAt?: string;
  posterUrl?: string | null;
  coverUrl?: string | null;
  contentType?: string | null;
  year?: number | null;
  // Music-specific fields
  artistImageUrl?: string | null;
  albumCoverUrl?: string | null;
  artist?: string | null;
  album?: string | null;
  // Legacy snake_case fields for backwards compatibility with direct DB queries
  clean_title?: string | null;
  total_size?: number;
  file_count?: number;
  created_at?: string;
  poster_url?: string | null;
  cover_url?: string | null;
  content_type?: string | null;
  artist_image_url?: string | null;
  album_cover_url?: string | null;
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

function getContentTypeIcon(contentType: string | null | undefined): string {
  switch (contentType) {
    case 'movie':
      return '🎬';
    case 'tvshow':
    case 'tv':
      return '📺';
    case 'music':
      return '🎵';
    case 'book':
      return '📚';
    case 'game':
      return '🎮';
    case 'software':
      return '💿';
    case 'xxx':
      return '🔞';
    default:
      return '📁';
  }
}

/**
 * Get the best available image URL for a torrent
 * Supports both camelCase (from API transform) and snake_case (from direct DB queries)
 * Priority: posterUrl > albumCoverUrl > artistImageUrl > coverUrl
 */
function getImageUrl(torrent: TorrentItem): string | null {
  return (
    torrent.posterUrl ?? torrent.poster_url ??
    torrent.albumCoverUrl ?? torrent.album_cover_url ??
    torrent.artistImageUrl ?? torrent.artist_image_url ??
    torrent.coverUrl ?? torrent.cover_url ??
    null
  );
}

/**
 * Get content type from torrent (supports both camelCase and snake_case)
 */
function getContentType(torrent: TorrentItem): string | null | undefined {
  return torrent.contentType ?? torrent.content_type;
}

/**
 * Get clean title from torrent (supports both camelCase and snake_case)
 */
function getCleanTitle(torrent: TorrentItem): string | null | undefined {
  return torrent.cleanTitle ?? torrent.clean_title;
}

/**
 * Get total size from torrent (supports both camelCase and snake_case)
 */
function getTotalSize(torrent: TorrentItem): number {
  return torrent.totalSize ?? torrent.total_size ?? 0;
}

/**
 * Get file count from torrent (supports both camelCase and snake_case)
 */
function getFileCount(torrent: TorrentItem): number {
  return torrent.fileCount ?? torrent.file_count ?? 0;
}

export function TorrentList({ torrents, onSelect, selectedId, onExpand }: TorrentListProps): React.ReactElement {
  return (
    <div className="space-y-2">
      {torrents.map((torrent) => {
        const imageUrl = getImageUrl(torrent);
        const contentType = getContentType(torrent);
        const cleanTitle = getCleanTitle(torrent);
        const totalSize = getTotalSize(torrent);
        const fileCount = getFileCount(torrent);
        const status = torrent.status ?? 'pending';
        // For music, use square aspect ratio for album covers
        const isMusic = contentType === 'music';
        
        return (
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
            <div className="flex items-start gap-4">
              {/* Poster/Cover Image - square for music, portrait for movies/tv */}
              <div className="flex-shrink-0">
                {imageUrl ? (
                  <div className={`relative overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800 ${
                    isMusic ? 'h-16 w-16' : 'h-20 w-14'
                  }`}>
                    <Image
                      src={imageUrl}
                      alt={cleanTitle ?? torrent.name}
                      fill
                      sizes={isMusic ? '64px' : '56px'}
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className={`flex items-center justify-center rounded-md bg-gray-100 text-2xl dark:bg-gray-800 ${
                    isMusic ? 'h-16 w-16' : 'h-20 w-14'
                  }`}>
                    {getContentTypeIcon(contentType)}
                  </div>
                )}
              </div>
              
              {/* Torrent Info */}
              <div className="flex-1 min-w-0">
                <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white" title={torrent.name}>
                  {cleanTitle ?? torrent.name}
                  {torrent.year ? <span className="ml-2 text-gray-500 dark:text-gray-400">({torrent.year})</span> : null}
                </h3>
                {/* Show artist/album for music */}
                {isMusic && (torrent.artist ?? torrent.album) ? <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                    {torrent.artist}
                    {torrent.artist && torrent.album ? ' — ' : null}
                    {torrent.album}
                  </p> : null}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  {contentType ? <>
                      <span className="capitalize">{contentType}</span>
                      <span>•</span>
                    </> : null}
                  <span>{fileCount} files</span>
                  <span>•</span>
                  <span>{formatBytes(totalSize)}</span>
                  <span>•</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(status)}`}>
                    {status}
                  </span>
                </div>
              </div>
              
              {/* Expand Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand?.(torrent);
                }}
                aria-label="Expand torrent"
                className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
