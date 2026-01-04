/**
 * Reader API Route Tests
 *
 * Tests for the /api/reader/[id] endpoint that fetches file info for the ebook reader.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock the supabase module
vi.mock('@/lib/supabase', () => ({
  getServerClient: vi.fn(function() {
    return {
      from: vi.fn(function() {
        return {
          select: vi.fn(function() {
            return {
              eq: vi.fn(function() {
                return {
                  single: vi.fn(),
                };
              }),
            };
          }),
        };
      }),
    };
  }),
}));

// Import after mocking
import { getServerClient } from '@/lib/supabase';

describe('GET /api/reader/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if file ID is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/reader/');
    const response = await GET(request, { params: Promise.resolve({ id: '' }) });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('File ID is required');
  });

  it('should return 404 if file is not found', async () => {
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows returned' },
            }),
          })),
        })),
      })),
    };
    vi.mocked(getServerClient).mockReturnValue(mockClient as unknown as ReturnType<typeof getServerClient>);

    const request = new NextRequest('http://localhost:3000/api/reader/non-existent-id');
    const response = await GET(request, { params: Promise.resolve({ id: 'non-existent-id' }) });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('File not found');
  });

  it('should return 400 if file is not an ebook', async () => {
    const mockFile = {
      id: 'file-123',
      torrent_id: 'torrent-456',
      file_index: 0,
      path: 'video.mp4',
      name: 'video.mp4',
      extension: 'mp4',
      size: 1000000,
      media_category: 'video',
      mime_type: 'video/mp4',
      torrents: {
        id: 'torrent-456',
        infohash: 'abc123def456',
        name: 'Test Video',
      },
    };

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: mockFile,
              error: null,
            }),
          })),
        })),
      })),
    };
    vi.mocked(getServerClient).mockReturnValue(mockClient as unknown as ReturnType<typeof getServerClient>);

    const request = new NextRequest('http://localhost:3000/api/reader/file-123');
    const response = await GET(request, { params: Promise.resolve({ id: 'file-123' }) });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('File is not an ebook');
  });

  it('should return file info for a valid epub file', async () => {
    const mockFile = {
      id: 'file-123',
      torrent_id: 'torrent-456',
      file_index: 2,
      path: 'books/test-book.epub',
      name: 'test-book.epub',
      extension: 'epub',
      size: 500000,
      media_category: 'ebook',
      mime_type: 'application/epub+zip',
      torrents: {
        id: 'torrent-456',
        infohash: 'abc123def456',
        name: 'Test Book Collection',
        clean_title: 'Test Book Collection',
      },
    };

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: mockFile,
              error: null,
            }),
          })),
        })),
      })),
    };
    vi.mocked(getServerClient).mockReturnValue(mockClient as unknown as ReturnType<typeof getServerClient>);

    const request = new NextRequest('http://localhost:3000/api/reader/file-123');
    const response = await GET(request, { params: Promise.resolve({ id: 'file-123' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
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
    });
  });

  it('should return file info for a valid pdf file', async () => {
    const mockFile = {
      id: 'file-789',
      torrent_id: 'torrent-456',
      file_index: 5,
      path: 'documents/manual.pdf',
      name: 'manual.pdf',
      extension: 'pdf',
      size: 2000000,
      media_category: 'ebook',
      mime_type: 'application/pdf',
      torrents: {
        id: 'torrent-456',
        infohash: 'xyz789abc123',
        name: 'Technical Manuals',
        clean_title: null,
      },
    };

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: mockFile,
              error: null,
            }),
          })),
        })),
      })),
    };
    vi.mocked(getServerClient).mockReturnValue(mockClient as unknown as ReturnType<typeof getServerClient>);

    const request = new NextRequest('http://localhost:3000/api/reader/file-789');
    const response = await GET(request, { params: Promise.resolve({ id: 'file-789' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
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
    });
  });

  it('should handle database errors gracefully', async () => {
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'INTERNAL', message: 'Database connection failed' },
            }),
          })),
        })),
      })),
    };
    vi.mocked(getServerClient).mockReturnValue(mockClient as unknown as ReturnType<typeof getServerClient>);

    const request = new NextRequest('http://localhost:3000/api/reader/file-123');
    const response = await GET(request, { params: Promise.resolve({ id: 'file-123' }) });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to fetch file information');
  });
});
