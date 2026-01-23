/**
 * TuneIn Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTuneInService } from './tunein';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TuneIn Service', () => {
  let service: ReturnType<typeof createTuneInService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createTuneInService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search', () => {
    it('returns empty array for empty query', async () => {
      const results = await service.search({ query: '' });
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns empty array for whitespace-only query', async () => {
      const results = await service.search({ query: '   ' });
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('searches for radio stations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [
            {
              element: 'outline',
              type: 'audio',
              guide_id: 's123',
              text: 'NPR News',
              subtext: 'National Public Radio',
              image: 'https://example.com/npr.png',
              item: 'station',
              genre_id: 'News',
              URL: 'http://...',
              reliability: 99,
            },
            {
              element: 'outline',
              type: 'audio',
              guide_id: 's456',
              text: 'ESPN Radio',
              item: 'station',
              genre_id: 'Sports',
              URL: 'http://...',
            },
          ],
        }),
      });

      const results = await service.search({ query: 'news' });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 's123',
        name: 'NPR News',
        description: 'National Public Radio',
        imageUrl: 'https://example.com/npr.png',
        genre: 'News',
        currentTrack: undefined,
        reliability: 99,
        formats: undefined,
      });
    });

    it('applies limit parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [
            { element: 'outline', type: 'audio', guide_id: 's1', text: 'Station 1', item: 'station', URL: 'http://...' },
            { element: 'outline', type: 'audio', guide_id: 's2', text: 'Station 2', item: 'station', URL: 'http://...' },
            { element: 'outline', type: 'audio', guide_id: 's3', text: 'Station 3', item: 'station', URL: 'http://...' },
          ],
        }),
      });

      const results = await service.search({ query: 'test', limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('handles API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const results = await service.search({ query: 'test' });

      expect(results).toEqual([]);
    });

    it('handles non-200 status in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '500' },
          body: [],
        }),
      });

      const results = await service.search({ query: 'test' });

      expect(results).toEqual([]);
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const results = await service.search({ query: 'test' });

      expect(results).toEqual([]);
    });

    it('sanitizes query to prevent XSS', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [],
        }),
      });

      await service.search({ query: '<script>alert("xss")</script>' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('<script>');
      expect(calledUrl).not.toContain('</script>');
    });
  });

  describe('getStream', () => {
    it('returns streams for a station', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [
            {
              url: 'https://stream.example.com/radio.mp3',
              media_type: 'mp3',
              bitrate: 128,
              is_direct: true,
            },
            {
              url: 'https://stream.example.com/radio.aac',
              media_type: 'aac',
              bitrate: 64,
              is_direct: true,
            },
          ],
        }),
      });

      const { streams, preferred } = await service.getStream('s123');

      expect(streams).toHaveLength(2);
      expect(streams[0]).toEqual({
        url: 'https://stream.example.com/radio.mp3',
        mediaType: 'mp3',
        bitrate: 128,
        isDirect: true,
      });
      // MP3 should be preferred over AAC
      expect(preferred?.mediaType).toBe('mp3');
    });

    it('prefers MP3 over AAC over HLS', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [
            { url: 'http://a.com/hls', media_type: 'hls', is_direct: true },
            { url: 'http://a.com/aac', media_type: 'aac', is_direct: true },
            { url: 'http://a.com/mp3', media_type: 'mp3', is_direct: true },
          ],
        }),
      });

      const { preferred } = await service.getStream('s123');

      expect(preferred?.mediaType).toBe('mp3');
    });

    it('returns empty streams on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { streams, preferred } = await service.getStream('invalid');

      expect(streams).toEqual([]);
      expect(preferred).toBeNull();
    });

    it('handles API fault message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200', fault: 'Station not found' },
          body: [],
        }),
      });

      const { streams, preferred } = await service.getStream('invalid');

      expect(streams).toEqual([]);
      expect(preferred).toBeNull();
    });
  });

  describe('getStationInfo', () => {
    it('returns station info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [
            {
              element: 'outline',
              type: 'audio',
              guide_id: 's123',
              text: 'NPR News',
              item: 'station',
              genre_id: 'News',
            },
          ],
        }),
      });

      const info = await service.getStationInfo('s123');

      expect(info).toEqual({
        id: 's123',
        name: 'NPR News',
        description: undefined,
        imageUrl: undefined,
        genre: 'News',
        currentTrack: undefined,
        reliability: undefined,
        formats: undefined,
      });
    });

    it('returns null when station not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [],
        }),
      });

      const info = await service.getStationInfo('invalid');

      expect(info).toBeNull();
    });
  });

  describe('getPopularStations', () => {
    it('returns popular stations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [
            { element: 'outline', type: 'audio', guide_id: 's1', text: 'Station 1', item: 'station', URL: 'http://...' },
            { element: 'outline', type: 'audio', guide_id: 's2', text: 'Station 2', item: 'station', URL: 'http://...' },
          ],
        }),
      });

      const stations = await service.getPopularStations();

      expect(stations).toHaveLength(2);
    });

    it('filters by genre when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          head: { status: '200' },
          body: [],
        }),
      });

      await service.getPopularStations('sports');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('c=sports');
    });
  });
});
