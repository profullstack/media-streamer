/**
 * Ebook Library Module
 *
 * Exports ebook utilities for format detection, reader configuration, and progress tracking
 */

export {
  getEbookFormat,
  isEbookFile,
  getEbookMimeType,
  getReaderConfig,
  formatPageNumber,
  calculateReadingProgress,
  estimateReadingTime,
  type EbookFormat,
  type ReaderConfig,
  type ReadingProgress,
  type ReadingTimeEstimate,
  type ReadingTimeOptions,
} from './ebook';

export {
  useFileDownload,
  formatDownloadProgress,
  type DownloadState,
  type DownloadOptions,
  type UseFileDownloadReturn,
} from './use-file-download';
