'use client';

/**
 * Reader Page
 *
 * Displays ebook content (EPUB or PDF) using the EbookReader component.
 * Fetches file info from the API and streams content from the torrent.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { EbookReader } from '@/components/ebook';
import { ChevronLeftIcon, LoadingSpinner, BookIcon } from '@/components/ui/icons';
import { FileFavoriteButton } from '@/components/ui/file-favorite-button';
import { formatBytes } from '@/lib/utils';

/**
 * File info from the API
 */
interface FileInfo {
  id: string;
  name: string;
  path: string;
  extension: string;
  size: number;
  mimeType: string;
  fileIndex: number;
}

/**
 * Torrent info from the API
 */
interface TorrentInfo {
  id: string;
  infohash: string;
  name: string;
  cleanTitle: string | null;
}

/**
 * API response type
 */
interface ReaderApiResponse {
  file: FileInfo;
  torrent: TorrentInfo;
  streamUrl: string;
}

/**
 * Error response type
 */
interface ErrorResponse {
  error: string;
}

export default function ReaderPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;

  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [torrentInfo, setTorrentInfo] = useState<TorrentInfo | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch file info from the API
  useEffect(() => {
    const fetchFileInfo = async (): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/reader/${fileId}`);
        const data = await response.json() as ReaderApiResponse | ErrorResponse;

        if (!response.ok) {
          const errorData = data as ErrorResponse;
          setError(errorData.error ?? 'Failed to load file');
          return;
        }

        const successData = data as ReaderApiResponse;
        setFileInfo(successData.file);
        setTorrentInfo(successData.torrent);
        setStreamUrl(successData.streamUrl);
      } catch (err) {
        console.error('[ReaderPage] Error fetching file info:', err);
        setError('Failed to load file information');
      } finally {
        setIsLoading(false);
      }
    };

    if (fileId) {
      void fetchFileInfo();
    }
  }, [fileId]);

  // Handle reader errors
  const handleReaderError = useCallback((err: Error) => {
    console.error('[ReaderPage] Reader error:', err);
    setError(`Failed to load ebook: ${err.message}`);
  }, []);

  // Handle position changes (for progress tracking)
  const handlePositionChange = useCallback((position: number | string, percentage: number) => {
    console.log('[ReaderPage] Position changed:', { position, percentage });
    // TODO: Save reading progress to the server
  }, []);

  // Handle back navigation
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // Loading state
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]" data-testid="reader-loading">
          <LoadingSpinner size={48} className="text-accent-primary" />
          <p className="mt-4 text-text-secondary">Loading ebook...</p>
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (error || !fileInfo || !torrentInfo || !streamUrl) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
          <div className="text-red-500 text-lg mb-4">
            <BookIcon size={48} className="mx-auto mb-4 opacity-50" />
            {error ?? 'File not found'}
          </div>
          <button
            onClick={handleBack}
            className="mt-4 px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors"
          >
            Go Back
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 bg-bg-secondary border-b border-border-subtle">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Go back"
          >
            <ChevronLeftIcon size={20} />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-text-primary truncate" title={fileInfo.name}>
              {fileInfo.name}
            </h1>
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Link
                href={`/torrents/${torrentInfo.id}`}
                className="hover:text-accent-primary truncate"
                title={torrentInfo.cleanTitle ?? torrentInfo.name}
              >
                {torrentInfo.cleanTitle ?? torrentInfo.name}
              </Link>
              <span>•</span>
              <span>{formatBytes(fileInfo.size)}</span>
              <span>•</span>
              <span className="uppercase">{fileInfo.extension}</span>
            </div>
          </div>

          {/* Favorite Button */}
          <FileFavoriteButton
            fileId={fileInfo.id}
            size="md"
            className="flex-shrink-0 hover:bg-bg-tertiary rounded-full"
          />
        </div>

        {/* Reader */}
        <div className="flex-1 overflow-hidden">
          <EbookReader
            file={streamUrl}
            filename={fileInfo.name}
            theme="dark"
            fontSize={16}
            onPositionChange={handlePositionChange}
            onError={handleReaderError}
            className="h-full"
          />
        </div>
      </div>
    </MainLayout>
  );
}
