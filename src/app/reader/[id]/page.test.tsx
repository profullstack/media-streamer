/**
 * Reader Page Tests
 *
 * Tests for the /reader/[id] page that displays ebook content.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ReaderPage from './page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'test-file-id' })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => '/reader/test-file-id'),
}));

// Mock MainLayout to be a simple passthrough component
vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));

// Mock the EbookReader component since it requires browser APIs
vi.mock('@/components/ebook', () => ({
  EbookReader: vi.fn(({ file, filename, onError }: { file: string; filename: string; onError?: (error: Error) => void }) => (
    <div data-testid="ebook-reader" data-file={file} data-filename={filename}>
      Mock Ebook Reader
    </div>
  )),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ReaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state initially', () => {
    // Create a promise that never resolves to keep the loading state
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<ReaderPage />);

    // The loading state should be visible immediately since isLoading starts as true
    expect(screen.getByTestId('reader-loading')).toBeInTheDocument();
  });

  it('should show error when file is not found', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'File not found' }),
    });

    render(<ReaderPage />);

    await waitFor(() => {
      expect(screen.getByText(/file not found/i)).toBeInTheDocument();
    });
  });

  it('should show error when file is not an ebook', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'File is not an ebook' }),
    });

    render(<ReaderPage />);

    await waitFor(() => {
      expect(screen.getByText(/file is not an ebook/i)).toBeInTheDocument();
    });
  });

  it('should render ebook reader for epub files', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        file: {
          id: 'file-123',
          name: 'test-book.epub',
          path: 'books/test-book.epub',
          extension: 'epub',
          size: 500000,
          mimeType: 'application/epub+zip',
          fileIndex: 2,
        },
        torrent: {
          id: 'torrent-456',
          infohash: 'abc123def456',
          name: 'Test Book Collection',
          cleanTitle: 'Test Book Collection',
        },
        streamUrl: '/api/stream?infohash=abc123def456&fileIndex=2',
      }),
    });

    render(<ReaderPage />);

    await waitFor(() => {
      const reader = screen.getByTestId('ebook-reader');
      expect(reader).toBeInTheDocument();
      expect(reader).toHaveAttribute('data-filename', 'test-book.epub');
    });
  });

  it('should render ebook reader for pdf files', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        file: {
          id: 'file-789',
          name: 'manual.pdf',
          path: 'documents/manual.pdf',
          extension: 'pdf',
          size: 2000000,
          mimeType: 'application/pdf',
          fileIndex: 5,
        },
        torrent: {
          id: 'torrent-456',
          infohash: 'xyz789abc123',
          name: 'Technical Manuals',
          cleanTitle: null,
        },
        streamUrl: '/api/stream?infohash=xyz789abc123&fileIndex=5',
      }),
    });

    render(<ReaderPage />);

    await waitFor(() => {
      const reader = screen.getByTestId('ebook-reader');
      expect(reader).toBeInTheDocument();
      expect(reader).toHaveAttribute('data-filename', 'manual.pdf');
    });
  });

  it('should display file name in the header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        file: {
          id: 'file-123',
          name: 'My Great Book.epub',
          path: 'books/My Great Book.epub',
          extension: 'epub',
          size: 500000,
          mimeType: 'application/epub+zip',
          fileIndex: 2,
        },
        torrent: {
          id: 'torrent-456',
          infohash: 'abc123def456',
          name: 'Book Collection',
          cleanTitle: 'Book Collection',
        },
        streamUrl: '/api/stream?infohash=abc123def456&fileIndex=2',
      }),
    });

    render(<ReaderPage />);

    await waitFor(() => {
      expect(screen.getByText('My Great Book.epub')).toBeInTheDocument();
    });
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<ReaderPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  it('should pass stream URL to ebook reader', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        file: {
          id: 'file-123',
          name: 'test-book.epub',
          path: 'books/test-book.epub',
          extension: 'epub',
          size: 500000,
          mimeType: 'application/epub+zip',
          fileIndex: 2,
        },
        torrent: {
          id: 'torrent-456',
          infohash: 'abc123def456',
          name: 'Test Book Collection',
          cleanTitle: 'Test Book Collection',
        },
        streamUrl: '/api/stream?infohash=abc123def456&fileIndex=2',
      }),
    });

    render(<ReaderPage />);

    await waitFor(() => {
      const reader = screen.getByTestId('ebook-reader');
      expect(reader).toHaveAttribute('data-file', '/api/stream?infohash=abc123def456&fileIndex=2');
    });
  });
});
