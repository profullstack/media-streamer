'use client';

/**
 * Unified Ebook Reader Component
 * 
 * Auto-detects format and renders appropriate reader (PDF or EPUB)
 */

import React, { useMemo } from 'react';
import { PdfReader, PdfReaderProps } from './pdf-reader';
import { EpubReader, EpubReaderProps } from './epub-reader';
import { getEbookFormat, isEbookFile, EbookFormat } from '@/lib/ebook';

/**
 * Ebook Reader Props
 */
export interface EbookReaderProps {
  /** URL or ArrayBuffer of the ebook file */
  file: string | ArrayBuffer;
  /** Filename (used for format detection if file is ArrayBuffer) */
  filename: string;
  /** Expected file size in bytes (used for download progress when Content-Length is unavailable) */
  expectedSize?: number;
  /** Initial page/location */
  initialPosition?: number | string;
  /** Initial zoom level (PDF only) */
  initialZoom?: number;
  /** Theme (EPUB only) */
  theme?: 'light' | 'dark' | 'sepia';
  /** Font size (EPUB only) */
  fontSize?: number;
  /** Callback when position changes */
  onPositionChange?: (position: number | string, percentage: number) => void;
  /** Callback when document loads */
  onLoad?: (info: { format: EbookFormat; totalPages?: number }) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Custom class name */
  className?: string;
}

/**
 * Unified Ebook Reader Component
 */
export function EbookReader({
  file,
  filename,
  expectedSize,
  initialPosition,
  initialZoom = 1.0,
  theme = 'dark',
  fontSize = 16,
  onPositionChange,
  onLoad,
  onError,
  className = '',
}: EbookReaderProps): React.ReactElement {
  // Detect format from filename
  const format = useMemo(() => getEbookFormat(filename), [filename]);

  // Handle unsupported format
  if (!format || !isEbookFile(filename)) {
    return (
      <div data-testid="ebook-reader" className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 text-lg mb-4">Unsupported Format</div>
        <div className="text-gray-400 text-sm">
          The file &quot;{filename}&quot; is not a supported ebook format.
        </div>
        <div className="text-gray-500 text-xs mt-2">
          Supported formats: PDF, EPUB, MOBI, AZW, AZW3, CBZ, CBR, FB2, DJVU
        </div>
      </div>
    );
  }

  // Render PDF reader
  if (format === 'pdf') {
    const pdfProps: PdfReaderProps = {
      file,
      initialPage: typeof initialPosition === 'number' ? initialPosition : 1,
      initialZoom,
      onPageChange: (page, total) => {
        const percentage = Math.round((page / total) * 100);
        onPositionChange?.(page, percentage);
      },
      onDocumentLoad: (totalPages) => {
        onLoad?.({ format: 'pdf', totalPages });
      },
      onError,
      className,
    };

    return <div data-testid="ebook-reader"><PdfReader {...pdfProps} /></div>;
  }

  // Render EPUB reader
  if (format === 'epub') {
    const epubProps: import('./epub-reader').EpubReaderProps = {
      file,
      expectedSize,
      initialLocation: typeof initialPosition === 'string' ? initialPosition : undefined,
      theme,
      fontSize,
      onLocationChange: (location, percentage) => {
        onPositionChange?.(location, percentage);
      },
      onBookLoad: () => {
        onLoad?.({ format: 'epub' });
      },
      onError,
      className,
    };

    return <div data-testid="ebook-reader"><EpubReader {...epubProps} /></div>;
  }

  // For other formats (MOBI, AZW, CBZ, etc.), show placeholder
  // These would require additional libraries or conversion
  return (
    <div data-testid="ebook-reader" className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <div className="text-yellow-500 text-lg mb-4">Format Not Yet Implemented</div>
      <div className="text-gray-400 text-sm">
        The {format.toUpperCase()} format is recognized but not yet fully supported.
      </div>
      <div className="text-gray-500 text-xs mt-2">
        Currently supported readers: PDF, EPUB
      </div>
    </div>
  );
}
