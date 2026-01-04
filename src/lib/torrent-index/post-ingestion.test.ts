/**
 * Post-Ingestion Service Tests
 *
 * Tests for automatic metadata enrichment and codec detection
 * after magnet URL ingestion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  triggerPostIngestionEnrichment,
  triggerCodecDetection,
  type PostIngestionOptions,
  type PostIngestionResult,
  type CodecDetectionResult,
} from './post-ingestion';

// Mock the metadata-enrichment module
vi.mock('@/lib/metadata-enrichment', () => ({
  enrichTorrentMetadata: vi.fn(),
  detectContentType: vi.fn(),
}));

// Mock the supabase module
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
                    return Promise.resolve({
                      data: {
                        id: 'torrent-123',
                        name: 'Test.Movie.2024.1080p.BluRay.x264',
                        infohash: 'abc123def456789012345678901234567890abcd',
                        status: 'pending',
                      },
                      error: null,
                    });
                  }),
                };
              }),
            };
          }),
          update: vi.fn(function() {
            return {
              eq: vi.fn(function() { return Promise.resolve({ error: null }); }),
            };
          }),
        };
      }),
    };
  }),
}));

// Mock the logger
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(function() {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(function() {
        return {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        };
      }),
    };
  }),
}));

import { enrichTorrentMetadata, detectContentType } from '@/lib/metadata-enrichment';
import { createServerClient } from '@/lib/supabase';

describe('Post-Ingestion Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    process.env.OMDB_API_KEY = 'test-omdb-key';
    process.env.FANART_TV_API_KEY = 'test-fanart-key';
  });

  afterEach(() => {
    delete process.env.OMDB_API_KEY;
    delete process.env.FANART_TV_API_KEY;
  });

  describe('triggerPostIngestionEnrichment', () => {
    it('should enrich metadata for a new torrent', async () => {
      vi.mocked(detectContentType).mockReturnValue('movie');
      vi.mocked(enrichTorrentMetadata).mockResolvedValue({
        contentType: 'movie',
        posterUrl: 'https://example.com/poster.jpg',
        externalId: 'tt1234567',
        externalSource: 'omdb',
        year: 2024,
        title: 'Test Movie',
      });

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test.Movie.2024.1080p.BluRay.x264',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(true);
      expect(result.enrichmentTriggered).toBe(true);
      expect(result.contentType).toBe('movie');
      expect(enrichTorrentMetadata).toHaveBeenCalledWith(
        'Test.Movie.2024.1080p.BluRay.x264',
        expect.objectContaining({
          omdbApiKey: 'test-omdb-key',
          fanartTvApiKey: 'test-fanart-key',
        })
      );
    });

    it('should skip enrichment for duplicate torrents', async () => {
      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test.Movie.2024.1080p.BluRay.x264',
        infohash: 'abc123def456789012345678901234567890abcd',
        isDuplicate: true,
      });

      expect(result.success).toBe(true);
      expect(result.enrichmentTriggered).toBe(false);
      expect(result.skippedReason).toBe('duplicate');
      expect(enrichTorrentMetadata).not.toHaveBeenCalled();
    });

    it('should skip enrichment for xxx content type', async () => {
      vi.mocked(detectContentType).mockReturnValue('xxx');

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Some.XXX.Content',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(true);
      expect(result.enrichmentTriggered).toBe(false);
      expect(result.skippedReason).toBe('content_type_excluded');
      expect(enrichTorrentMetadata).not.toHaveBeenCalled();
    });

    it('should skip enrichment for other content type', async () => {
      vi.mocked(detectContentType).mockReturnValue('other');

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Random.Files.Archive',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(true);
      expect(result.enrichmentTriggered).toBe(false);
      expect(result.skippedReason).toBe('content_type_excluded');
    });

    it('should update database with enrichment results', async () => {
      vi.mocked(detectContentType).mockReturnValue('movie');
      vi.mocked(enrichTorrentMetadata).mockResolvedValue({
        contentType: 'movie',
        posterUrl: 'https://example.com/poster.jpg',
        externalId: 'tt1234567',
        externalSource: 'omdb',
        year: 2024,
        title: 'Test Movie',
        description: 'A test movie description',
      });

      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      }));

      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: {
                  id: 'torrent-123',
                  name: 'Test.Movie.2024.1080p.BluRay.x264',
                },
                error: null,
              })),
            })),
          })),
          update: mockUpdate,
        })),
      } as unknown as ReturnType<typeof createServerClient>);

      await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test.Movie.2024.1080p.BluRay.x264',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content_type: 'movie',
          poster_url: 'https://example.com/poster.jpg',
          external_id: 'tt1234567',
          external_source: 'omdb',
          year: 2024,
          description: 'A test movie description',
        })
      );
    });

    it('should handle enrichment errors gracefully', async () => {
      vi.mocked(detectContentType).mockReturnValue('movie');
      vi.mocked(enrichTorrentMetadata).mockRejectedValue(new Error('API timeout'));

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test.Movie.2024.1080p.BluRay.x264',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
    });

    it('should enrich music content with MusicBrainz', async () => {
      vi.mocked(detectContentType).mockReturnValue('music');
      vi.mocked(enrichTorrentMetadata).mockResolvedValue({
        contentType: 'music',
        coverUrl: 'https://example.com/cover.jpg',
        externalId: 'mb-123',
        externalSource: 'musicbrainz',
        artist: 'Test Artist',
        title: 'Test Album',
      });

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test Artist - Test Album [FLAC]',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(true);
      expect(result.contentType).toBe('music');
      expect(enrichTorrentMetadata).toHaveBeenCalledWith(
        'Test Artist - Test Album [FLAC]',
        expect.objectContaining({
          musicbrainzUserAgent: expect.stringContaining('BitTorrented'),
        })
      );
    });

    it('should enrich TV show content', async () => {
      vi.mocked(detectContentType).mockReturnValue('tvshow');
      vi.mocked(enrichTorrentMetadata).mockResolvedValue({
        contentType: 'tvshow',
        posterUrl: 'https://example.com/poster.jpg',
        externalId: 'tt9876543',
        externalSource: 'omdb',
        year: 2023,
        title: 'Test Show',
      });

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test.Show.S01E01.1080p.WEB-DL',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(true);
      expect(result.contentType).toBe('tvshow');
    });

    it('should enrich book content with Open Library', async () => {
      vi.mocked(detectContentType).mockReturnValue('book');
      vi.mocked(enrichTorrentMetadata).mockResolvedValue({
        contentType: 'book',
        coverUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg',
        externalId: 'OL123M',
        externalSource: 'openlibrary',
        year: 2020,
        title: 'Test Book',
      });

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Author Name - Test Book [EPUB]',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(true);
      expect(result.contentType).toBe('book');
    });

    it('should work without API keys configured', async () => {
      delete process.env.OMDB_API_KEY;
      delete process.env.FANART_TV_API_KEY;

      vi.mocked(detectContentType).mockReturnValue('movie');
      vi.mocked(enrichTorrentMetadata).mockResolvedValue({
        contentType: 'movie',
        error: 'OMDb API key not configured',
      });

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test.Movie.2024.1080p.BluRay.x264',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      // Should still succeed but with limited enrichment
      expect(result.success).toBe(true);
      expect(result.enrichmentTriggered).toBe(true);
    });

    it('should handle database update errors', async () => {
      vi.mocked(detectContentType).mockReturnValue('movie');
      vi.mocked(enrichTorrentMetadata).mockResolvedValue({
        contentType: 'movie',
        posterUrl: 'https://example.com/poster.jpg',
      });

      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { id: 'torrent-123', name: 'Test' },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              error: { message: 'Database connection failed' },
            })),
          })),
        })),
      } as unknown as ReturnType<typeof createServerClient>);

      const result = await triggerPostIngestionEnrichment('torrent-123', {
        torrentName: 'Test.Movie.2024.1080p.BluRay.x264',
        infohash: 'abc123def456789012345678901234567890abcd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database');
    });
  });

  describe('triggerCodecDetection', () => {
    it('should trigger codec detection for video files', async () => {
      // Only video files should be returned by the query (filtered by .in())
      const mockVideoFiles = [
        { id: 'file-1', file_index: 0, media_category: 'video', path: 'movie.mkv' },
      ];

      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({
                data: mockVideoFiles,
                error: null,
              })),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof createServerClient>);

      const result = await triggerCodecDetection('torrent-123', 'abc123def456789012345678901234567890abcd');

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(1);
    });

    it('should trigger codec detection for audio files', async () => {
      const mockAudioFiles = [
        { id: 'file-1', file_index: 0, media_category: 'audio', path: 'song.flac' },
      ];

      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({
                data: mockAudioFiles,
                error: null,
              })),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof createServerClient>);

      const result = await triggerCodecDetection('torrent-123', 'abc123def456789012345678901234567890abcd');

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(1);
    });

    it('should skip codec detection when no media files exist', async () => {
      // Empty array - no video/audio files found
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({
                data: [],
                error: null,
              })),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof createServerClient>);

      const result = await triggerCodecDetection('torrent-123', 'abc123def456789012345678901234567890abcd');

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(0);
      expect(result.skippedReason).toBe('no_media_files');
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({
                data: null,
                error: { message: 'Database error' },
              })),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof createServerClient>);

      const result = await triggerCodecDetection('torrent-123', 'abc123def456789012345678901234567890abcd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database');
    });

    it('should limit codec detection to first N files', async () => {
      // Create 10 video files
      const mockFiles = Array.from({ length: 10 }, (_, i) => ({
        id: `file-${i}`,
        file_index: i,
        media_category: 'video',
        path: `video${i}.mkv`,
      }));

      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({
                data: mockFiles,
                error: null,
              })),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof createServerClient>);

      const result = await triggerCodecDetection('torrent-123', 'abc123def456789012345678901234567890abcd', {
        maxFiles: 5,
      });

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBeLessThanOrEqual(5);
    });
  });
});
