/**
 * Ebook Library Tests
 * 
 * Tests for ebook format detection, reader configuration, and utilities
 */

import { describe, it, expect } from 'vitest';
import {
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
} from './ebook';

describe('Ebook Library', () => {
  describe('getEbookFormat', () => {
    it('should detect PDF format', () => {
      expect(getEbookFormat('book.pdf')).toBe('pdf');
      expect(getEbookFormat('document.PDF')).toBe('pdf');
      expect(getEbookFormat('path/to/file.pdf')).toBe('pdf');
    });

    it('should detect EPUB format', () => {
      expect(getEbookFormat('book.epub')).toBe('epub');
      expect(getEbookFormat('novel.EPUB')).toBe('epub');
      expect(getEbookFormat('path/to/book.epub')).toBe('epub');
    });

    it('should detect MOBI format', () => {
      expect(getEbookFormat('book.mobi')).toBe('mobi');
      expect(getEbookFormat('kindle.MOBI')).toBe('mobi');
    });

    it('should detect AZW format', () => {
      expect(getEbookFormat('book.azw')).toBe('azw');
      expect(getEbookFormat('book.azw3')).toBe('azw3');
      expect(getEbookFormat('book.AZW3')).toBe('azw3');
    });

    it('should detect CBZ/CBR comic formats', () => {
      expect(getEbookFormat('comic.cbz')).toBe('cbz');
      expect(getEbookFormat('comic.cbr')).toBe('cbr');
      expect(getEbookFormat('manga.CBZ')).toBe('cbz');
    });

    it('should detect FB2 format', () => {
      expect(getEbookFormat('book.fb2')).toBe('fb2');
      expect(getEbookFormat('russian.FB2')).toBe('fb2');
    });

    it('should detect DjVu format', () => {
      expect(getEbookFormat('scan.djvu')).toBe('djvu');
      expect(getEbookFormat('document.DJVU')).toBe('djvu');
    });

    it('should return null for non-ebook formats', () => {
      expect(getEbookFormat('video.mp4')).toBeNull();
      expect(getEbookFormat('audio.mp3')).toBeNull();
      expect(getEbookFormat('image.jpg')).toBeNull();
      expect(getEbookFormat('document.txt')).toBeNull();
      expect(getEbookFormat('noextension')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(getEbookFormat('')).toBeNull();
      expect(getEbookFormat('.pdf')).toBe('pdf');
      expect(getEbookFormat('file.name.pdf')).toBe('pdf');
    });
  });

  describe('isEbookFile', () => {
    it('should return true for ebook files', () => {
      expect(isEbookFile('book.pdf')).toBe(true);
      expect(isEbookFile('book.epub')).toBe(true);
      expect(isEbookFile('book.mobi')).toBe(true);
      expect(isEbookFile('comic.cbz')).toBe(true);
    });

    it('should return false for non-ebook files', () => {
      expect(isEbookFile('video.mp4')).toBe(false);
      expect(isEbookFile('audio.mp3')).toBe(false);
      expect(isEbookFile('image.png')).toBe(false);
    });
  });

  describe('getEbookMimeType', () => {
    it('should return correct MIME type for PDF', () => {
      expect(getEbookMimeType('pdf')).toBe('application/pdf');
    });

    it('should return correct MIME type for EPUB', () => {
      expect(getEbookMimeType('epub')).toBe('application/epub+zip');
    });

    it('should return correct MIME type for MOBI', () => {
      expect(getEbookMimeType('mobi')).toBe('application/x-mobipocket-ebook');
    });

    it('should return correct MIME type for AZW formats', () => {
      expect(getEbookMimeType('azw')).toBe('application/vnd.amazon.ebook');
      expect(getEbookMimeType('azw3')).toBe('application/vnd.amazon.ebook');
    });

    it('should return correct MIME type for comic formats', () => {
      expect(getEbookMimeType('cbz')).toBe('application/vnd.comicbook+zip');
      expect(getEbookMimeType('cbr')).toBe('application/vnd.comicbook-rar');
    });

    it('should return correct MIME type for FB2', () => {
      expect(getEbookMimeType('fb2')).toBe('application/x-fictionbook+xml');
    });

    it('should return correct MIME type for DjVu', () => {
      expect(getEbookMimeType('djvu')).toBe('image/vnd.djvu');
    });

    it('should return octet-stream for unknown formats', () => {
      expect(getEbookMimeType('unknown' as EbookFormat)).toBe('application/octet-stream');
    });
  });

  describe('getReaderConfig', () => {
    it('should return PDF reader config', () => {
      const config = getReaderConfig('pdf');
      expect(config.format).toBe('pdf');
      expect(config.supportsPagination).toBe(true);
      expect(config.supportsSearch).toBe(true);
      expect(config.supportsZoom).toBe(true);
      expect(config.supportsAnnotations).toBe(true);
    });

    it('should return EPUB reader config', () => {
      const config = getReaderConfig('epub');
      expect(config.format).toBe('epub');
      expect(config.supportsPagination).toBe(true);
      expect(config.supportsSearch).toBe(true);
      expect(config.supportsThemes).toBe(true);
      expect(config.supportsFontSize).toBe(true);
    });

    it('should return comic reader config', () => {
      const cbzConfig = getReaderConfig('cbz');
      expect(cbzConfig.format).toBe('cbz');
      expect(cbzConfig.supportsPagination).toBe(true);
      expect(cbzConfig.supportsZoom).toBe(true);
      expect(cbzConfig.supportsDoublePage).toBe(true);

      const cbrConfig = getReaderConfig('cbr');
      expect(cbrConfig.format).toBe('cbr');
      expect(cbrConfig.supportsDoublePage).toBe(true);
    });

    it('should return MOBI reader config', () => {
      const config = getReaderConfig('mobi');
      expect(config.format).toBe('mobi');
      expect(config.supportsPagination).toBe(true);
      expect(config.requiresConversion).toBe(false); // MOBI now supported via foliate-js
    });

    it('should return default config for unsupported formats', () => {
      const config = getReaderConfig('unknown' as EbookFormat);
      expect(config.format).toBe('unknown');
      expect(config.supportsPagination).toBe(false);
    });
  });

  describe('formatPageNumber', () => {
    it('should format single page number', () => {
      expect(formatPageNumber(1, 100)).toBe('Page 1 of 100');
      expect(formatPageNumber(50, 100)).toBe('Page 50 of 100');
      expect(formatPageNumber(100, 100)).toBe('Page 100 of 100');
    });

    it('should handle edge cases', () => {
      expect(formatPageNumber(0, 100)).toBe('Page 0 of 100');
      expect(formatPageNumber(1, 1)).toBe('Page 1 of 1');
    });

    it('should format with custom template', () => {
      expect(formatPageNumber(5, 10, '{current}/{total}')).toBe('5/10');
      expect(formatPageNumber(5, 10, '{current} / {total}')).toBe('5 / 10');
    });
  });

  describe('calculateReadingProgress', () => {
    it('should calculate progress percentage', () => {
      const progress = calculateReadingProgress(50, 100);
      expect(progress.currentPage).toBe(50);
      expect(progress.totalPages).toBe(100);
      expect(progress.percentage).toBe(50);
    });

    it('should handle beginning of book', () => {
      const progress = calculateReadingProgress(1, 100);
      expect(progress.percentage).toBe(1);
    });

    it('should handle end of book', () => {
      const progress = calculateReadingProgress(100, 100);
      expect(progress.percentage).toBe(100);
    });

    it('should handle single page book', () => {
      const progress = calculateReadingProgress(1, 1);
      expect(progress.percentage).toBe(100);
    });

    it('should round percentage to integer', () => {
      const progress = calculateReadingProgress(33, 100);
      expect(progress.percentage).toBe(33);
      
      const progress2 = calculateReadingProgress(1, 3);
      expect(progress2.percentage).toBe(33); // 33.33... rounded down
    });

    it('should include pages remaining', () => {
      const progress = calculateReadingProgress(25, 100);
      expect(progress.pagesRemaining).toBe(75);
    });
  });

  describe('estimateReadingTime', () => {
    it('should estimate reading time for average reader', () => {
      // Average reading speed: ~250 words per minute
      // Average page: ~250 words
      // So roughly 1 page per minute
      const time = estimateReadingTime(60); // 60 pages
      expect(time.minutes).toBeGreaterThanOrEqual(50);
      expect(time.minutes).toBeLessThanOrEqual(70);
    });

    it('should format time as hours and minutes', () => {
      const time = estimateReadingTime(120);
      expect(time.formatted).toMatch(/\d+h \d+m|\d+ hours?/);
    });

    it('should handle short books', () => {
      const time = estimateReadingTime(10);
      expect(time.minutes).toBeLessThan(20);
    });

    it('should handle long books', () => {
      const time = estimateReadingTime(500);
      expect(time.hours).toBeGreaterThan(5);
    });

    it('should accept custom words per page', () => {
      const time = estimateReadingTime(100, { wordsPerPage: 500 });
      expect(time.minutes).toBeGreaterThan(150);
    });

    it('should accept custom reading speed', () => {
      const fastReader = estimateReadingTime(100, { wordsPerMinute: 500 });
      const slowReader = estimateReadingTime(100, { wordsPerMinute: 150 });
      expect(fastReader.minutes).toBeLessThan(slowReader.minutes);
    });
  });

  describe('ReaderConfig type', () => {
    it('should have correct structure', () => {
      const config: ReaderConfig = {
        format: 'pdf',
        supportsPagination: true,
        supportsSearch: true,
        supportsZoom: true,
        supportsAnnotations: false,
        supportsThemes: false,
        supportsFontSize: false,
        supportsDoublePage: false,
        requiresConversion: false,
      };

      expect(config).toHaveProperty('format');
      expect(config).toHaveProperty('supportsPagination');
    });
  });

  describe('ReadingProgress type', () => {
    it('should have correct structure', () => {
      const progress: ReadingProgress = {
        currentPage: 50,
        totalPages: 100,
        percentage: 50,
        pagesRemaining: 50,
      };

      expect(progress).toHaveProperty('currentPage');
      expect(progress).toHaveProperty('totalPages');
      expect(progress).toHaveProperty('percentage');
      expect(progress).toHaveProperty('pagesRemaining');
    });
  });

  describe('EbookFormat type', () => {
    it('should include all supported formats', () => {
      const formats: EbookFormat[] = ['pdf', 'epub', 'mobi', 'azw', 'azw3', 'cbz', 'cbr', 'fb2', 'djvu'];
      formats.forEach(format => {
        expect(getEbookMimeType(format)).toBeDefined();
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle files with multiple dots', () => {
      expect(getEbookFormat('my.book.name.pdf')).toBe('pdf');
      expect(getEbookFormat('author.title.epub')).toBe('epub');
    });

    it('should handle files with spaces', () => {
      expect(getEbookFormat('my book.pdf')).toBe('pdf');
      expect(getEbookFormat('the great novel.epub')).toBe('epub');
    });

    it('should handle unicode filenames', () => {
      expect(getEbookFormat('日本語の本.pdf')).toBe('pdf');
      expect(getEbookFormat('книга.epub')).toBe('epub');
    });

    it('should handle very long filenames', () => {
      const longName = 'a'.repeat(200) + '.pdf';
      expect(getEbookFormat(longName)).toBe('pdf');
    });
  });
});
