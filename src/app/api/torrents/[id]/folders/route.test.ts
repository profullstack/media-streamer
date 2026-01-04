/**
 * Torrent Folders API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(function() {
    return {
      from: vi.fn(function() {
        return {
          select: vi.fn(function() {
            return {
              eq: vi.fn(function() {
                return {
                  data: [
                    {
                      id: 'folder-1',
                      torrent_id: 'torrent-123',
                      path: 'Metallica - Discography/Kill Em All (1983)',
                      artist: 'Metallica',
                      album: 'Kill Em All',
                      year: 1983,
                      cover_url: 'https://coverartarchive.org/release-group/abc/front-500.jpg',
                      external_id: 'abc',
                      external_source: 'musicbrainz',
                    },
                    {
                      id: 'folder-2',
                      torrent_id: 'torrent-123',
                      path: 'Metallica - Discography/Ride the Lightning (1984)',
                      artist: 'Metallica',
                      album: 'Ride the Lightning',
                      year: 1984,
                      cover_url: 'https://coverartarchive.org/release-group/def/front-500.jpg',
                      external_id: 'def',
                      external_source: 'musicbrainz',
                    },
                  ],
                  error: null,
                };
              }),
            };
          }),
        };
      }),
    };
  }),
}));

describe('GET /api/torrents/[id]/folders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return folder metadata for a torrent', async () => {
    const request = new NextRequest('http://localhost:3000/api/torrents/torrent-123/folders');
    const params = Promise.resolve({ id: 'torrent-123' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.folders).toHaveLength(2);
    expect(data.folders[0]).toEqual({
      id: 'folder-1',
      torrentId: 'torrent-123',
      path: 'Metallica - Discography/Kill Em All (1983)',
      artist: 'Metallica',
      album: 'Kill Em All',
      year: 1983,
      coverUrl: 'https://coverartarchive.org/release-group/abc/front-500.jpg',
      externalId: 'abc',
      externalSource: 'musicbrainz',
    });
  });

  it('should return empty array when no folders exist', async () => {
    // Override mock for this test
    const { createServerClient } = await import('@/lib/supabase');
    vi.mocked(createServerClient).mockReturnValueOnce({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
    } as unknown as ReturnType<typeof createServerClient>);

    const request = new NextRequest('http://localhost:3000/api/torrents/torrent-456/folders');
    const params = Promise.resolve({ id: 'torrent-456' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.folders).toHaveLength(0);
  });

  it('should return 400 for missing torrent ID', async () => {
    const request = new NextRequest('http://localhost:3000/api/torrents//folders');
    const params = Promise.resolve({ id: '' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Torrent ID is required');
  });
});
