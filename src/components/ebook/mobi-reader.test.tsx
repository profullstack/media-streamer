/**
 * MOBI Reader Component Tests
 *
 * Tests for the MOBI reader component using mocked useFileDownload hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobiReader } from './mobi-reader';

// Mock foliate-js modules
vi.mock('foliate-js/view.js', () => ({
  makeBook: vi.fn(() =>
    Promise.resolve({
      metadata: { title: 'Test Book' },
      toc: [],
      sections: [],
    })
  ),
}));

vi.mock('foliate-js/paginator.js', () => ({}));

// Create mock functions that can be controlled per-test
const mockUseFileDownload = vi.fn();
const mockRetry = vi.fn();

// Mock @/lib/ebook exports
vi.mock('@/lib/ebook', () => ({
  calculateReadingProgress: vi.fn(() => ({ percentage: 0 })),
  formatDownloadProgress: vi.fn((bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`),
  useFileDownload: (...args: unknown[]) => mockUseFileDownload(...args),
}));

describe('MobiReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock return value - not downloading, no data
    mockUseFileDownload.mockReturnValue({
      isDownloading: false,
      progress: null,
      downloadedBytes: 0,
      totalBytes: 0,
      data: null,
      error: null,
      retry: mockRetry,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Download Progress', () => {
    it('shows downloading state with percentage when progress is available', () => {
      mockUseFileDownload.mockReturnValue({
        isDownloading: true,
        progress: 50,
        downloadedBytes: 500,
        totalBytes: 1000,
        data: null,
        error: null,
        retry: mockRetry,
      });

      render(<MobiReader file="http://example.com/book.mobi" expectedSize={1000} />);

      expect(screen.getByText(/Downloading MOBI \(50%\)/)).toBeInTheDocument();
    });

    it('shows downloading state with bytes when progress is null', () => {
      mockUseFileDownload.mockReturnValue({
        isDownloading: true,
        progress: null,
        downloadedBytes: 500000, // 500 KB
        totalBytes: 0,
        data: null,
        error: null,
        retry: mockRetry,
      });

      render(<MobiReader file="http://example.com/book.mobi" />);

      // Should show bytes downloaded (mocked formatDownloadProgress returns MB)
      expect(screen.getByText(/Downloading MOBI/)).toBeInTheDocument();
    });

    it('shows indeterminate downloading state when no progress info', () => {
      mockUseFileDownload.mockReturnValue({
        isDownloading: true,
        progress: null,
        downloadedBytes: 0,
        totalBytes: 0,
        data: null,
        error: null,
        retry: mockRetry,
      });

      render(<MobiReader file="http://example.com/book.mobi" />);

      expect(screen.getByText(/Downloading MOBI\.\.\./)).toBeInTheDocument();
    });

    it('does not call useFileDownload with URL when file is ArrayBuffer', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);

      render(<MobiReader file={mockArrayBuffer} />);

      // Should call useFileDownload with null URL when file is ArrayBuffer
      expect(mockUseFileDownload).toHaveBeenCalledWith(null, expect.any(Object));
    });

    it('passes expectedSize to useFileDownload', () => {
      render(<MobiReader file="http://example.com/book.mobi" expectedSize={2000} />);

      expect(mockUseFileDownload).toHaveBeenCalledWith(
        'http://example.com/book.mobi',
        expect.objectContaining({ expectedSize: 2000 })
      );
    });
  });

  describe('Error Handling', () => {
    it('shows error state when download fails', () => {
      const downloadError = new Error('Download failed: 404 Not Found');
      mockUseFileDownload.mockReturnValue({
        isDownloading: false,
        progress: null,
        downloadedBytes: 0,
        totalBytes: 0,
        data: null,
        error: downloadError,
        retry: mockRetry,
      });

      render(<MobiReader file="http://example.com/book.mobi" />);

      expect(screen.getByText(/Failed to load MOBI/)).toBeInTheDocument();
      expect(screen.getByText(/Download failed: 404 Not Found/)).toBeInTheDocument();
    });

    it('shows 503 specific message when torrent not ready', () => {
      const downloadError = new Error('Download failed: 503 Service Unavailable');
      mockUseFileDownload.mockReturnValue({
        isDownloading: false,
        progress: null,
        downloadedBytes: 0,
        totalBytes: 0,
        data: null,
        error: downloadError,
        retry: mockRetry,
      });

      render(<MobiReader file="http://example.com/book.mobi" />);

      expect(screen.getByText(/torrent may still be connecting/)).toBeInTheDocument();
    });

    it('shows Try Again button on error', () => {
      const downloadError = new Error('Download failed');
      mockUseFileDownload.mockReturnValue({
        isDownloading: false,
        progress: null,
        downloadedBytes: 0,
        totalBytes: 0,
        data: null,
        error: downloadError,
        retry: mockRetry,
      });

      render(<MobiReader file="http://example.com/book.mobi" />);

      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('accepts expectedSize prop', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);
      mockUseFileDownload.mockReturnValue({
        isDownloading: false,
        progress: null,
        downloadedBytes: 0,
        totalBytes: 0,
        data: mockArrayBuffer,
        error: null,
        retry: mockRetry,
      });

      expect(() => {
        render(<MobiReader file={mockArrayBuffer} expectedSize={1000} />);
      }).not.toThrow();
    });

    it('works without expectedSize prop', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);
      mockUseFileDownload.mockReturnValue({
        isDownloading: false,
        progress: null,
        downloadedBytes: 0,
        totalBytes: 0,
        data: mockArrayBuffer,
        error: null,
        retry: mockRetry,
      });

      expect(() => {
        render(<MobiReader file={mockArrayBuffer} />);
      }).not.toThrow();
    });

    it('accepts filename prop', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);
      mockUseFileDownload.mockReturnValue({
        isDownloading: false,
        progress: null,
        downloadedBytes: 0,
        totalBytes: 0,
        data: mockArrayBuffer,
        error: null,
        retry: mockRetry,
      });

      expect(() => {
        render(<MobiReader file={mockArrayBuffer} filename="mybook.mobi" />);
      }).not.toThrow();
    });
  });

  describe('Loading state', () => {
    it('shows loading state after download completes', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);
      mockUseFileDownload.mockReturnValue({
        isDownloading: false,
        progress: 100,
        downloadedBytes: 1000,
        totalBytes: 1000,
        data: mockArrayBuffer,
        error: null,
        retry: mockRetry,
      });

      render(<MobiReader file="http://example.com/book.mobi" />);

      // After download, should show "Loading book..." while foliate-js initializes
      expect(screen.getByText(/Loading book\.\.\./)).toBeInTheDocument();
    });
  });
});
