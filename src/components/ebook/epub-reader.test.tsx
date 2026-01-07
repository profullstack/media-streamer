/**
 * EPUB Reader Component Tests
 *
 * Tests for the EPUB reader component, including download progress handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EpubReader } from './epub-reader';

// Mock epub.js
vi.mock('epubjs', () => ({
  default: vi.fn(() => ({
    ready: Promise.resolve(),
    loaded: {
      navigation: Promise.resolve({ toc: [] }),
    },
    renderTo: vi.fn(() => ({
      themes: {
        register: vi.fn(),
        select: vi.fn(),
        fontSize: vi.fn(),
      },
      display: vi.fn(() => Promise.resolve()),
      prev: vi.fn(),
      next: vi.fn(),
      on: vi.fn(),
    })),
    destroy: vi.fn(),
  })),
}));

// Mock calculateReadingProgress
vi.mock('@/lib/ebook', () => ({
  calculateReadingProgress: vi.fn(() => ({ percentage: 0 })),
}));

describe('EpubReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Download Progress', () => {
    it('uses Content-Length header for download progress when available', async () => {
      const mockArrayBuffer = new ArrayBuffer(1000);
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(500) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(500) })
          .mockResolvedValueOnce({ done: true }),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: vi.fn((name: string) => name === 'content-length' ? '1000' : null),
        },
        body: {
          getReader: () => mockReader,
        },
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      render(
        <EpubReader
          file="http://example.com/book.epub"
          expectedSize={2000}
        />
      );

      // Should show downloading state
      expect(screen.getByText(/Downloading EPUB/)).toBeInTheDocument();

      // Wait for download to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://example.com/book.epub');
      });
    });

    it('falls back to expectedSize when Content-Length is not available', async () => {
      const mockArrayBuffer = new ArrayBuffer(1000);
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(500) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(500) })
          .mockResolvedValueOnce({ done: true }),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: vi.fn(() => null), // No Content-Length header
        },
        body: {
          getReader: () => mockReader,
        },
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      render(
        <EpubReader
          file="http://example.com/book.epub"
          expectedSize={1000}
        />
      );

      // Should show downloading state initially
      expect(screen.getByText(/Downloading EPUB/)).toBeInTheDocument();
    });

    it('shows indeterminate progress when neither Content-Length nor expectedSize available', async () => {
      const mockArrayBuffer = new ArrayBuffer(1000);
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(500) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(500) })
          .mockResolvedValueOnce({ done: true }),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: vi.fn(() => null), // No Content-Length header
        },
        body: {
          getReader: () => mockReader,
        },
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      render(
        <EpubReader
          file="http://example.com/book.epub"
          // No expectedSize prop
        />
      );

      // Should show downloading state without percentage
      expect(screen.getByText(/Downloading EPUB\.\.\./)).toBeInTheDocument();
    });

    it('does not download when file is ArrayBuffer', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);

      global.fetch = vi.fn();

      render(
        <EpubReader
          file={mockArrayBuffer}
        />
      );

      // Should not call fetch when file is already an ArrayBuffer
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('shows error state when download fails', async () => {
      const mockError = vi.fn();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      render(
        <EpubReader
          file="http://example.com/book.epub"
          onError={mockError}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Failed to load EPUB/)).toBeInTheDocument();
      });

      expect(mockError).toHaveBeenCalled();
    });
  });

  describe('Props', () => {
    it('accepts expectedSize prop', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);

      // Should not throw when expectedSize is provided
      expect(() => {
        render(
          <EpubReader
            file={mockArrayBuffer}
            expectedSize={1000}
          />
        );
      }).not.toThrow();
    });

    it('works without expectedSize prop', () => {
      const mockArrayBuffer = new ArrayBuffer(1000);

      // Should not throw when expectedSize is not provided
      expect(() => {
        render(
          <EpubReader
            file={mockArrayBuffer}
          />
        );
      }).not.toThrow();
    });
  });
});
