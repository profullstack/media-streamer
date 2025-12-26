'use client';

/**
 * Torrent Detail Page
 * 
 * Shows torrent information and file browser.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { FileTree } from '@/components/files';
import { SearchBar, type SearchFilters } from '@/components/search';
import {
  MagnetIcon,
  ChevronRightIcon,
  LoadingSpinner,
  MusicIcon,
  VideoIcon,
  BookIcon,
  FileIcon,
} from '@/components/ui/icons';
import { formatBytes } from '@/lib/utils';
import type { Torrent, TorrentFile } from '@/types';

interface TorrentDetailResponse {
  torrent: Torrent;
  files: TorrentFile[];
}

export default function TorrentDetailPage(): React.ReactElement {
  const params = useParams();
  const torrentId = params.id as string;

  const [torrent, setTorrent] = useState<Torrent | null>(null);
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<TorrentFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch torrent details
  useEffect(() => {
    const fetchTorrent = async (): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/torrents/${torrentId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Torrent not found');
          }
          const errorData = await response.json() as { error?: string };
          throw new Error(errorData.error ?? 'Failed to load torrent');
        }

        const data = await response.json() as TorrentDetailResponse;
        setTorrent(data.torrent);
        setFiles(data.files);
        setFilteredFiles(data.files);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    if (torrentId) {
      void fetchTorrent();
    }
  }, [torrentId]);

  // Handle search within torrent
  const handleSearch = useCallback((query: string, filters: SearchFilters) => {
    if (!query.trim() && filters.mediaTypes.length === 0) {
      setFilteredFiles(files);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = files.filter((file) => {
      // Filter by query
      const matchesQuery = !query.trim() || 
        file.name.toLowerCase().includes(lowerQuery) ||
        file.path.toLowerCase().includes(lowerQuery);

      // Filter by media type
      const matchesType = filters.mediaTypes.length === 0 ||
        filters.mediaTypes.includes(file.mediaCategory);

      return matchesQuery && matchesType;
    });

    setFilteredFiles(filtered);
  }, [files]);

  // Handle file play
  const handleFilePlay = useCallback((file: TorrentFile) => {
    if (torrent) {
      const streamUrl = `/api/stream?infohash=${torrent.infohash}&fileIndex=${file.fileIndex}`;
      window.open(streamUrl, '_blank');
    }
  }, [torrent]);

  // Handle file download
  const handleFileDownload = useCallback((file: TorrentFile) => {
    if (torrent) {
      const streamUrl = `/api/stream?infohash=${torrent.infohash}&fileIndex=${file.fileIndex}`;
      const link = document.createElement('a');
      link.href = streamUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [torrent]);

  // Calculate media type counts
  const mediaCounts = files.reduce(
    (acc, file) => {
      acc[file.mediaCategory] = (acc[file.mediaCategory] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size={32} className="text-accent-primary" />
          <span className="ml-3 text-text-secondary">Loading torrent...</span>
        </div>
      </MainLayout>
    );
  }

  if (error || !torrent) {
    return (
      <MainLayout>
        <div className="py-12 text-center">
          <p className="text-error">{error ?? 'Torrent not found'}</p>
          <Link
            href="/torrents"
            className="mt-4 inline-block text-accent-primary hover:underline"
          >
            Back to torrents
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-text-muted">
          <Link href="/torrents" className="hover:text-text-primary">
            Torrents
          </Link>
          <ChevronRightIcon size={14} />
          <span className="text-text-primary">{torrent.name}</span>
        </nav>

        {/* Header */}
        <div className="card p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-primary/20">
              <MagnetIcon className="text-accent-primary" size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold text-text-primary">
                {torrent.name}
              </h1>
              <p className="mt-1 font-mono text-xs text-text-muted">
                {torrent.infohash}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-text-muted">Total Size</p>
              <p className="text-lg font-medium text-text-primary">
                {formatBytes(torrent.totalSize)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Files</p>
              <p className="text-lg font-medium text-text-primary">
                {torrent.fileCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Piece Size</p>
              <p className="text-lg font-medium text-text-primary">
                {formatBytes(torrent.pieceLength)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Added</p>
              <p className="text-lg font-medium text-text-primary">
                {new Date(torrent.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Media type breakdown */}
          <div className="mt-6 flex flex-wrap gap-3">
            {mediaCounts.audio && mediaCounts.audio > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-accent-audio/10 px-3 py-1 text-sm">
                <MusicIcon className="text-accent-audio" size={14} />
                <span className="text-text-primary">{mediaCounts.audio} audio</span>
              </div>
            )}
            {mediaCounts.video && mediaCounts.video > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-accent-video/10 px-3 py-1 text-sm">
                <VideoIcon className="text-accent-video" size={14} />
                <span className="text-text-primary">{mediaCounts.video} video</span>
              </div>
            )}
            {mediaCounts.ebook && mediaCounts.ebook > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-accent-ebook/10 px-3 py-1 text-sm">
                <BookIcon className="text-accent-ebook" size={14} />
                <span className="text-text-primary">{mediaCounts.ebook} ebook</span>
              </div>
            )}
            {mediaCounts.document && mediaCounts.document > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-bg-tertiary px-3 py-1 text-sm">
                <FileIcon className="text-text-secondary" size={14} />
                <span className="text-text-primary">{mediaCounts.document} document</span>
              </div>
            )}
            {mediaCounts.other && mediaCounts.other > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-bg-tertiary px-3 py-1 text-sm">
                <FileIcon className="text-text-secondary" size={14} />
                <span className="text-text-primary">{mediaCounts.other} other</span>
              </div>
            )}
          </div>
        </div>

        {/* File Browser */}
        <div className="card">
          <div className="border-b border-border-subtle p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">Files</h2>
              <span className="text-sm text-text-muted">
                {filteredFiles.length} of {files.length} files
              </span>
            </div>
            <div className="mt-3">
              <SearchBar
                onSearch={handleSearch}
                placeholder="Filter files..."
                showFilters={true}
                debounceMs={150}
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto p-2">
            {filteredFiles.length > 0 ? (
              <FileTree
                files={filteredFiles}
                onFilePlay={handleFilePlay}
                onFileDownload={handleFileDownload}
              />
            ) : (
              <div className="py-8 text-center text-text-muted">
                No files match your filter
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
