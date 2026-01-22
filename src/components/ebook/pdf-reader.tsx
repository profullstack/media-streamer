'use client';

/**
 * PDF Reader Component
 *
 * Uses react-pdf to render PDF documents with pagination, zoom, and search.
 * Pre-downloads files using shared download utility for better UX with torrent streaming.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { formatPageNumber, calculateReadingProgress, useFileDownload, formatDownloadProgress } from '@/lib/ebook';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PDF Reader Props
 */
export interface PdfReaderProps {
  /** URL or ArrayBuffer of the PDF file */
  file: string | ArrayBuffer;
  /** Expected file size in bytes (used for download progress when Content-Length is unavailable) */
  expectedSize?: number;
  /** Initial page number (default: 1) */
  initialPage?: number;
  /** Initial zoom level (default: 1.0) */
  initialZoom?: number;
  /** Callback when page changes */
  onPageChange?: (page: number, totalPages: number) => void;
  /** Callback when document loads */
  onDocumentLoad?: (totalPages: number) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Custom class name */
  className?: string;
}

/**
 * PDF Reader Component
 */
export function PdfReader({
  file,
  expectedSize,
  initialPage = 1,
  initialZoom = 1.0,
  onPageChange,
  onDocumentLoad,
  onError,
  className = '',
}: PdfReaderProps): React.ReactElement {
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

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(initialZoom);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pdfError, setPdfError] = useState<Error | null>(null);

  // Combined error from download or PDF loading
  const error = downloadError || pdfError;

  // Handle document load success
  const handleDocumentLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => {
      setNumPages(pages);
      setIsLoading(false);
      onDocumentLoad?.(pages);
    },
    [onDocumentLoad]
  );

  // Handle document load error
  const handleDocumentLoadError = useCallback(
    (err: Error) => {
      setPdfError(err);
      setIsLoading(false);
      onError?.(err);
    },
    [onError]
  );

  // Navigate to previous page
  const goToPreviousPage = useCallback(() => {
    setPageNumber((prev) => {
      const newPage = Math.max(1, prev - 1);
      onPageChange?.(newPage, numPages);
      return newPage;
    });
  }, [numPages, onPageChange]);

  // Navigate to next page
  const goToNextPage = useCallback(() => {
    setPageNumber((prev) => {
      const newPage = Math.min(numPages, prev + 1);
      onPageChange?.(newPage, numPages);
      return newPage;
    });
  }, [numPages, onPageChange]);

  // Navigate to specific page
  const goToPage = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(numPages, page));
      setPageNumber(validPage);
      onPageChange?.(validPage, numPages);
    },
    [numPages, onPageChange]
  );

  // Zoom in
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(3.0, prev + 0.25));
  }, []);

  // Zoom out
  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.5, prev - 0.25));
  }, []);

  // Reset zoom
  const resetZoom = useCallback(() => {
    setScale(1.0);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPreviousPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      } else if (e.key === 'Home') {
        goToPage(1);
      } else if (e.key === 'End') {
        goToPage(numPages);
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, goToNextPage, goToPage, numPages, zoomIn, zoomOut, resetZoom]);

  const progress = calculateReadingProgress(pageNumber, numPages);

  // Retry handler - resets PDF error and triggers download retry
  const handleRetry = useCallback(() => {
    setPdfError(null);
    setIsLoading(true);
    retryDownload();
  }, [retryDownload]);

  if (error) {
    const is503 = error.message.includes('503');
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 text-lg mb-4">Failed to load PDF</div>
        <div className="text-gray-400 text-sm mb-4">{error.message}</div>
        {is503 && (
          <div className="text-gray-500 text-xs mb-4 text-center max-w-md">
            The torrent may still be connecting to peers. This can take a few seconds for less popular files.
          </div>
        )}
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
            ? `Downloading PDF (${downloadProgress}%)`
            : downloadedBytes > 0
              ? `Downloading PDF (${formatDownloadProgress(downloadedBytes)})`
              : 'Downloading PDF...'}
        </p>
        {(downloadProgress !== null || downloadedBytes > 0) && (
          <div className="mt-2 w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                downloadProgress !== null ? 'bg-blue-500' : 'bg-blue-500 animate-pulse'
              }`}
              style={{ width: downloadProgress !== null ? `${downloadProgress}%` : '100%' }}
            />
          </div>
        )}
      </div>
    );
  }

  // Wait for file data
  if (!fileData) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        <p className="mt-4 text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousPage}
            disabled={pageNumber <= 1}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            aria-label="Previous page"
          >
            ←
          </button>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={numPages}
              value={pageNumber}
              onChange={(e) => goToPage(parseInt(e.target.value, 10) || 1)}
              className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-center"
              aria-label="Page number"
            />
            <span className="text-gray-400">/ {numPages}</span>
          </div>

          <button
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            aria-label="Next page"
          >
            →
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            aria-label="Zoom out"
          >
            −
          </button>

          <span className="text-gray-300 min-w-[60px] text-center">{Math.round(scale * 100)}%</span>

          <button
            onClick={zoomIn}
            disabled={scale >= 3.0}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            aria-label="Zoom in"
          >
            +
          </button>

          <button
            onClick={resetZoom}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            aria-label="Reset zoom"
          >
            Reset
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

      {/* Document viewer */}
      <div className="flex-1 overflow-auto bg-gray-950 flex justify-center p-4">
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : null}

        <Document
          file={{ data: fileData }}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={handleDocumentLoadError}
          loading={null}
          className="flex justify-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-2xl"
          />
        </Document>
      </div>

      {/* Footer */}
      <div className="p-2 bg-gray-900 border-t border-gray-700 text-center text-gray-400 text-sm">
        {formatPageNumber(pageNumber, numPages)}
      </div>
    </div>
  );
}
