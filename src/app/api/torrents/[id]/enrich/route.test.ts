/**
 * Tests for Torrent Enrichment API Route
 *
 * POST /api/torrents/[id]/enrich - Trigger metadata enrichment for a torrent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

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
                  single: vi.fn(function() {
                    return {
                      data: {
                        id: 'test-torrent-id',
                        name: 'Pink Floyd - Discography [FLAC]',
                        infohash: 'abc123def456',
                        status: 'ready',
                        content_type: null,
                        poster_url: null,
                        cover_url: null,
                      },
                      error: null,
                    };
                  }),
                };
              }),
            };
          }),
          update: vi.fn(function() {
            return {
              eq: vi.fn(function() {
                return {
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

// Mock metadata enrichment
vi.mock('@/lib/metadata-enrichment', () => ({
  enrichTorrentMetadata: vi.fn(function() {
    return Promise.resolve({
      contentType: 'music',
      posterUrl: 'https://example.com/poster.jpg',
      coverUrl: 'https://coverartarchive.org/release-group/abc123/front',
      artistImageUrl: 'https://fanart.tv/artist/abc123.jpg',
      externalId: 'mb-123',
      externalSource: 'musicbrainz',
      year: 1973,
      title: 'The Dark Side of the Moon',
      artist: 'Pink Floyd',
    });
  }),
  detectContentType: vi.fn(function() { return 'music'; }),
}));

describe('POST /api/torrents/[id]/enrich', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enrich torrent metadata successfully', async () => {
    const request = new NextRequest('http://localhost/api/torrents/test-id/enrich', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'test-id' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.enrichment).toBeDefined();
    expect(data.enrichment.contentType).toBe('music');
  });

  it('should return 400 if torrent ID is missing', async () => {
    const request = new NextRequest('http://localhost/api/torrents//enrich', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: '' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Torrent ID is required');
  });

  it('should return 404 if torrent not found', async () => {
    const { createServerClient } = await import('@/lib/supabase');
    vi.mocked(createServerClient).mockReturnValueOnce({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null,
              error: { message: 'Not found' },
            })),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof createServerClient>);

    const request = new NextRequest('http://localhost/api/torrents/not-found/enrich', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'not-found' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Torrent not found');
  });

  it('should handle enrichment errors gracefully', async () => {
    const { enrichTorrentMetadata } = await import('@/lib/metadata-enrichment');
    vi.mocked(enrichTorrentMetadata).mockResolvedValueOnce({
      contentType: 'music',
      error: 'MusicBrainz API error: 503',
    });

    const request = new NextRequest('http://localhost/api/torrents/test-id/enrich', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'test-id' }) });
    const data = await response.json();

    // Should still return 200 but with error in enrichment result
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.enrichment.error).toBe('MusicBrainz API error: 503');
  });

  it('should skip enrichment for "other" content type', async () => {
    const { enrichTorrentMetadata } = await import('@/lib/metadata-enrichment');
    vi.mocked(enrichTorrentMetadata).mockResolvedValueOnce({
      contentType: 'other',
    });

    const request = new NextRequest('http://localhost/api/torrents/test-id/enrich', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'test-id' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.enrichment.contentType).toBe('other');
  });

  it('should update torrent with enriched metadata', async () => {
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        error: null,
      })),
    }));

    const { createServerClient } = await import('@/lib/supabase');
    vi.mocked(createServerClient).mockReturnValueOnce({
      from: vi.fn((table: string) => {
        if (table === 'torrents') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: {
                    id: 'test-torrent-id',
                    name: 'Pink Floyd - Discography [FLAC]',
                    infohash: 'abc123def456',
                    status: 'ready',
                  },
                  error: null,
                })),
              })),
            })),
            update: mockUpdate,
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
        };
      }),
    } as unknown as ReturnType<typeof createServerClient>);

    const request = new NextRequest('http://localhost/api/torrents/test-id/enrich', {
      method: 'POST',
    });

    await POST(request, { params: Promise.resolve({ id: 'test-id' }) });

    expect(mockUpdate).toHaveBeenCalled();
  });
});
