'use client';

/**
 * MOBI Reader Component
 *
 * Uses foliate-js to render MOBI/AZW/AZW3 documents with navigation and themes
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { calculateReadingProgress, useFileDownload, formatDownloadProgress } from '@/lib/ebook';

// Define types for foliate-js (library doesn't include TypeScript definitions)
interface FoliateBook {
  metadata?: {
    title?: string;
    creator?: string[];
    language?: string;
  };
  toc?: FoliateTocItem[];
  sections?: { id: number; linear?: string }[];
  getCover?: () => Promise<Blob | null>;
}

interface FoliateTocItem {
  label: string;
  href: string;
  subitems?: FoliateTocItem[];
}

interface FoliateLocation {
  fraction?: number;
  cfi?: string;
  tocItem?: { label: string };
}

/**
 * MOBI Reader Props
 */
export interface MobiReaderProps {
  /** URL or ArrayBuffer of the MOBI file */
  file: string | ArrayBuffer;
  /** Filename for display */
  filename?: string;
  /** Expected file size in bytes (used for download progress when Content-Length is unavailable) */
  expectedSize?: number;
  /** Callback when location changes */
  onLocationChange?: (location: string, percentage: number) => void;
  /** Callback when book loads */
  onBookLoad?: (book: FoliateBook) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Custom class name */
  className?: string;
}

/**
 * MOBI Reader Component
 */
export function MobiReader({
  file,
  filename = 'book.mobi',
  expectedSize,
  onLocationChange,
  onBookLoad,
  onError,
  className = '',
}: MobiReaderProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLElement | null>(null);
  const bookRef = useRef<FoliateBook | null>(null);

  // Use shared download hook for URL files
  const downloadUrl = typeof file === 'string' ? file : null;
  const {
    isDownloading,
    progress: downloadProgress,
    downloadedBytes,
    data: downloadedData,
    error: downloadError,
    retry: retryDownload,
  } = useFileDownload(downloadUrl, {
    expectedSize,
    onError,
  });

  // File data is either passed directly or downloaded
  const fileData = typeof file !== 'string' ? file : downloadedData;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bookError, setBookError] = useState<Error | null>(null);
  const [toc, setToc] = useState<FoliateTocItem[]>([]);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [percentage, setPercentage] = useState<number>(0);

  // Combined error from download or book loading
  const error = downloadError || bookError;

  // Initialize book after file is available
  useEffect(() => {
    if (!containerRef.current || !fileData || isDownloading) return;

    let aborted = false;

    const initBook = async (): Promise<void> => {
      try {
        // Dynamically import foliate-js (uses native ES modules)
        const { makeBook } = await import('foliate-js/view.js');

        // Also need to register the custom element for paginator
        await import('foliate-js/paginator.js');

        if (aborted) return;

        // Convert ArrayBuffer to File object (foliate-js expects File/Blob)
        const blob = new Blob([fileData], { type: 'application/x-mobipocket-ebook' });
        const bookFile = new File([blob], filename, { type: 'application/x-mobipocket-ebook' });

        // Create book using foliate-js
        const book = await makeBook(bookFile);

        if (aborted) return;

        bookRef.current = book;

        // Get table of contents if available
        if (book.toc) {
          setToc(book.toc);
        }

        // Create the foliate-view custom element
        const view = document.createElement('foliate-view') as HTMLElement;
        view.style.width = '100%';
        view.style.height = '100%';

        // Store reference
        viewRef.current = view;

        // Clear container and append view
        containerRef.current!.innerHTML = '';
        containerRef.current!.appendChild(view);

        // Listen for relocation events
        view.addEventListener('relocate', ((e: CustomEvent<FoliateLocation>) => {
          const detail = e.detail;
          const pct = Math.round((detail.fraction ?? 0) * 100);
          setPercentage(pct);
          onLocationChange?.(detail.cfi ?? '', pct);
        }) as EventListener);

        // Open the book in the view
        await (view as unknown as { open: (book: FoliateBook) => Promise<void> }).open(book);

        if (aborted) return;

        setIsLoading(false);
        onBookLoad?.(book);
      } catch (err) {
        if (aborted) return;
        console.error('Failed to load MOBI:', err);
        const error = err instanceof Error ? err : new Error('Failed to load MOBI');
        setBookError(error);
        setIsLoading(false);
        onError?.(error);
      }
    };

    initBook();

    // Cleanup
    return () => {
      aborted = true;
      if (viewRef.current) {
        // Call close method if available
        const view = viewRef.current as unknown as { close?: () => void };
        view.close?.();
        viewRef.current.remove();
        viewRef.current = null;
      }
      bookRef.current = null;
    };
  }, [fileData, isDownloading, filename, onBookLoad, onError, onLocationChange]);

  // Navigate to previous page
  const goToPreviousPage = useCallback(() => {
    const view = viewRef.current as unknown as { prev?: () => void };
    view?.prev?.();
  }, []);

  // Navigate to next page
  const goToNextPage = useCallback(() => {
    const view = viewRef.current as unknown as { next?: () => void };
    view?.next?.();
  }, []);

  // Navigate to specific location
  const goToLocation = useCallback((href: string) => {
    const view = viewRef.current as unknown as { goTo?: (href: string) => void };
    view?.goTo?.(href);
    setShowToc(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPreviousPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      } else if (e.key === 't') {
        setShowToc((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, goToNextPage]);

  const progress = calculateReadingProgress(percentage, 100);

  // Retry handler - resets book error and triggers download retry
  const handleRetry = useCallback(() => {
    setBookError(null);
    retryDownload();
  }, [retryDownload]);

  if (error) {
    const is503 = error.message.includes('503');
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 text-lg mb-4">Failed to load MOBI</div>
        <div className="text-gray-400 text-sm mb-4">{error.message}</div>
        {is503 ? (
          <div className="text-gray-500 text-xs mb-4 text-center max-w-md">
            The torrent may still be connecting to peers. This can take a few seconds for less popular files.
          </div>
        ) : null}
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show download progress
  if (isDownloading) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        <p className="mt-4 text-gray-400 text-sm">
          {downloadProgress !== null
            ? `Downloading MOBI (${downloadProgress}%)`
            : downloadedBytes > 0
              ? `Downloading MOBI (${formatDownloadProgress(downloadedBytes)})`
              : 'Downloading MOBI...'}
        </p>
        {downloadProgress !== null || downloadedBytes > 0 ? (
          <div className="mt-2 w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                downloadProgress !== null ? 'bg-blue-500' : 'bg-blue-500 animate-pulse'
              }`}
              style={{ width: downloadProgress !== null ? `${downloadProgress}%` : '100%' }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full relative ${className}`}>
      {/* Loading overlay - shown while book is initializing */}
      {isLoading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
          <p className="mt-4 text-gray-400 text-sm">Loading book...</p>
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowToc((prev) => !prev)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Toggle table of contents"
          >
            ☰
          </button>

          <button
            onClick={goToPreviousPage}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Previous page"
          >
            ←
          </button>

          <button
            onClick={goToNextPage}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Next page"
          >
            →
          </button>
        </div>

        {/* Progress */}
        <div className="text-gray-400 text-sm">{progress.percentage}% complete</div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Table of Contents sidebar */}
        {showToc ? (
          <div className="w-64 bg-gray-900 border-r border-gray-700 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">Contents</h3>
              <nav>
                <ul className="space-y-2">
                  {toc.map((item, index) => (
                    <li key={index}>
                      <button
                        onClick={() => goToLocation(item.href)}
                        className="text-left w-full px-2 py-1 hover:bg-gray-800 rounded text-sm text-gray-300 hover:text-white"
                      >
                        {item.label}
                      </button>
                      {item.subitems && item.subitems.length > 0 ? (
                        <ul className="ml-4 mt-1 space-y-1">
                          {item.subitems.map((subitem, subindex) => (
                            <li key={subindex}>
                              <button
                                onClick={() => goToLocation(subitem.href)}
                                className="text-left w-full px-2 py-1 hover:bg-gray-800 rounded text-xs text-gray-400 hover:text-white"
                              >
                                {subitem.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
        ) : null}

        {/* MOBI content */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={containerRef}
            className="absolute inset-0 overflow-hidden bg-white"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 bg-gray-900 border-t border-gray-700 text-center text-gray-400 text-sm">
        {percentage}% • Press ← → to navigate, T for contents
      </div>
    </div>
  );
}
