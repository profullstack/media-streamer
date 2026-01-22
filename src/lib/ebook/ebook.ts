/**
 * Ebook Library
 * 
 * Utilities for ebook format detection, reader configuration, and reading progress
 */

/**
 * Supported ebook formats
 */
export type EbookFormat = 
  | 'pdf' 
  | 'epub' 
  | 'mobi' 
  | 'azw' 
  | 'azw3' 
  | 'cbz' 
  | 'cbr' 
  | 'fb2' 
  | 'djvu';

/**
 * Reader configuration for different ebook formats
 */
export interface ReaderConfig {
  format: EbookFormat | 'unknown';
  supportsPagination: boolean;
  supportsSearch: boolean;
  supportsZoom: boolean;
  supportsAnnotations: boolean;
  supportsThemes: boolean;
  supportsFontSize: boolean;
  supportsDoublePage: boolean;
  requiresConversion: boolean;
}

/**
 * Reading progress information
 */
export interface ReadingProgress {
  currentPage: number;
  totalPages: number;
  percentage: number;
  pagesRemaining: number;
}

/**
 * Reading time estimate
 */
export interface ReadingTimeEstimate {
  minutes: number;
  hours: number;
  formatted: string;
}

/**
 * Options for reading time estimation
 */
export interface ReadingTimeOptions {
  wordsPerPage?: number;
  wordsPerMinute?: number;
}

/**
 * Extension to format mapping
 */
const EBOOK_EXTENSIONS: Record<string, EbookFormat> = {
  pdf: 'pdf',
  epub: 'epub',
  mobi: 'mobi',
  azw: 'azw',
  azw3: 'azw3',
  cbz: 'cbz',
  cbr: 'cbr',
  fb2: 'fb2',
  djvu: 'djvu',
};

/**
 * MIME types for ebook formats
 */
const EBOOK_MIME_TYPES: Record<EbookFormat, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook',
  azw3: 'application/vnd.amazon.ebook',
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar',
  fb2: 'application/x-fictionbook+xml',
  djvu: 'image/vnd.djvu',
};

/**
 * Get the ebook format from a filename
 * 
 * @param filename - The filename to check
 * @returns The ebook format or null if not an ebook
 */
export function getEbookFormat(filename: string): EbookFormat | null {
  if (!filename) {
    return null;
  }

  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return null;
  }

  const extension = filename.slice(lastDot + 1).toLowerCase();
  return EBOOK_EXTENSIONS[extension] ?? null;
}

/**
 * Check if a file is an ebook
 * 
 * @param filename - The filename to check
 * @returns true if the file is an ebook
 */
export function isEbookFile(filename: string): boolean {
  return getEbookFormat(filename) !== null;
}

/**
 * Get the MIME type for an ebook format
 * 
 * @param format - The ebook format
 * @returns The MIME type
 */
export function getEbookMimeType(format: EbookFormat): string {
  return EBOOK_MIME_TYPES[format] ?? 'application/octet-stream';
}

/**
 * Get reader configuration for an ebook format
 * 
 * @param format - The ebook format
 * @returns Reader configuration
 */
export function getReaderConfig(format: EbookFormat | 'unknown'): ReaderConfig {
  switch (format) {
    case 'pdf':
      return {
        format: 'pdf',
        supportsPagination: true,
        supportsSearch: true,
        supportsZoom: true,
        supportsAnnotations: true,
        supportsThemes: false,
        supportsFontSize: false,
        supportsDoublePage: true,
        requiresConversion: false,
      };

    case 'epub':
      return {
        format: 'epub',
        supportsPagination: true,
        supportsSearch: true,
        supportsZoom: false,
        supportsAnnotations: true,
        supportsThemes: true,
        supportsFontSize: true,
        supportsDoublePage: false,
        requiresConversion: false,
      };

    case 'mobi':
      return {
        format: 'mobi',
        supportsPagination: true,
        supportsSearch: true,
        supportsZoom: false,
        supportsAnnotations: false,
        supportsThemes: false,
        supportsFontSize: false,
        supportsDoublePage: false,
        requiresConversion: false,
      };

    case 'azw':
    case 'azw3':
      return {
        format,
        supportsPagination: true,
        supportsSearch: true,
        supportsZoom: false,
        supportsAnnotations: false,
        supportsThemes: false,
        supportsFontSize: false,
        supportsDoublePage: false,
        requiresConversion: false,
      };

    case 'cbz':
    case 'cbr':
      return {
        format,
        supportsPagination: true,
        supportsSearch: false,
        supportsZoom: true,
        supportsAnnotations: false,
        supportsThemes: false,
        supportsFontSize: false,
        supportsDoublePage: true,
        requiresConversion: false,
      };

    case 'fb2':
      return {
        format: 'fb2',
        supportsPagination: true,
        supportsSearch: true,
        supportsZoom: false,
        supportsAnnotations: false,
        supportsThemes: true,
        supportsFontSize: true,
        supportsDoublePage: false,
        requiresConversion: true,
      };

    case 'djvu':
      return {
        format: 'djvu',
        supportsPagination: true,
        supportsSearch: true,
        supportsZoom: true,
        supportsAnnotations: false,
        supportsThemes: false,
        supportsFontSize: false,
        supportsDoublePage: true,
        requiresConversion: true,
      };

    default:
      return {
        format: 'unknown',
        supportsPagination: false,
        supportsSearch: false,
        supportsZoom: false,
        supportsAnnotations: false,
        supportsThemes: false,
        supportsFontSize: false,
        supportsDoublePage: false,
        requiresConversion: false,
      };
  }
}

/**
 * Format a page number for display
 * 
 * @param current - Current page number
 * @param total - Total number of pages
 * @param template - Optional template string (default: "Page {current} of {total}")
 * @returns Formatted page string
 */
export function formatPageNumber(
  current: number,
  total: number,
  template: string = 'Page {current} of {total}'
): string {
  return template
    .replace('{current}', String(current))
    .replace('{total}', String(total));
}

/**
 * Calculate reading progress
 * 
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @returns Reading progress information
 */
export function calculateReadingProgress(
  currentPage: number,
  totalPages: number
): ReadingProgress {
  const percentage = totalPages > 0 
    ? Math.floor((currentPage / totalPages) * 100) 
    : 0;

  return {
    currentPage,
    totalPages,
    percentage,
    pagesRemaining: Math.max(0, totalPages - currentPage),
  };
}

/**
 * Estimate reading time for a book
 * 
 * @param totalPages - Total number of pages
 * @param options - Reading time options
 * @returns Reading time estimate
 */
export function estimateReadingTime(
  totalPages: number,
  options: ReadingTimeOptions = {}
): ReadingTimeEstimate {
  const wordsPerPage = options.wordsPerPage ?? 250;
  const wordsPerMinute = options.wordsPerMinute ?? 250;

  const totalWords = totalPages * wordsPerPage;
  const totalMinutes = Math.ceil(totalWords / wordsPerMinute);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  let formatted: string;
  if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  } else {
    formatted = `${minutes} minutes`;
  }

  return {
    minutes: totalMinutes,
    hours,
    formatted,
  };
}
