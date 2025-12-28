/**
 * Artist Image Service Tests
 * 
 * Tests for fetching artist images from MusicBrainz and Fanart.tv
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildMusicBrainzArtistSearchUrl,
  buildFanartTvArtistUrl,
  parseMusicBrainzArtistResponse,
  parseFanartTvArtistResponse,
  fetchArtistImage,
  type MusicBrainzArtistResponse,
  type FanartTvArtistResponse,
} from './artist-image';

describe('Artist Image Service', () => {
  describe('buildMusicBrainzArtistSearchUrl', () => {
    it('should build correct URL for artist search', () => {
      const url = buildMusicBrainzArtistSearchUrl('Pink Floyd');
      expect(url).toBe('https://musicbrainz.org/ws/2/artist?query=Pink%20Floyd&fmt=json&limit=1');
    });

    it('should encode special characters in artist name', () => {
      const url = buildMusicBrainzArtistSearchUrl('AC/DC');
      expect(url).toBe('https://musicbrainz.org/ws/2/artist?query=AC%2FDC&fmt=json&limit=1');
    });

    it('should handle empty string', () => {
      const url = buildMusicBrainzArtistSearchUrl('');
      expect(url).toBe('https://musicbrainz.org/ws/2/artist?query=&fmt=json&limit=1');
    });
  });

  describe('buildFanartTvArtistUrl', () => {
    it('should build correct URL with MBID and API key', () => {
      const url = buildFanartTvArtistUrl('83d91898-7763-47d7-b03b-b92132375c47', 'test-api-key');
      expect(url).toBe('https://webservice.fanart.tv/v3/music/83d91898-7763-47d7-b03b-b92132375c47?api_key=test-api-key');
    });
  });

  describe('parseMusicBrainzArtistResponse', () => {
    it('should parse valid artist response', () => {
      const response: MusicBrainzArtistResponse = {
        artists: [
          {
            id: '83d91898-7763-47d7-b03b-b92132375c47',
            name: 'Pink Floyd',
            'sort-name': 'Pink Floyd',
            score: 100,
          },
        ],
      };

      const result = parseMusicBrainzArtistResponse(response);
      expect(result).toEqual({
        mbid: '83d91898-7763-47d7-b03b-b92132375c47',
        name: 'Pink Floyd',
      });
    });

    it('should return undefined for empty artists array', () => {
      const response: MusicBrainzArtistResponse = {
        artists: [],
      };

      const result = parseMusicBrainzArtistResponse(response);
      expect(result).toBeUndefined();
    });

    it('should return undefined for missing artists', () => {
      const response: MusicBrainzArtistResponse = {};

      const result = parseMusicBrainzArtistResponse(response);
      expect(result).toBeUndefined();
    });
  });

  describe('parseFanartTvArtistResponse', () => {
    it('should return artistthumb URL when available', () => {
      const response: FanartTvArtistResponse = {
        name: 'Pink Floyd',
        mbid_id: '83d91898-7763-47d7-b03b-b92132375c47',
        artistthumb: [
          { id: '1', url: 'https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/artistthumb/pink-floyd-1.jpg', likes: '10' },
          { id: '2', url: 'https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/artistthumb/pink-floyd-2.jpg', likes: '5' },
        ],
      };

      const result = parseFanartTvArtistResponse(response);
      expect(result).toBe('https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/artistthumb/pink-floyd-1.jpg');
    });

    it('should fall back to artistbackground when no artistthumb', () => {
      const response: FanartTvArtistResponse = {
        name: 'Pink Floyd',
        mbid_id: '83d91898-7763-47d7-b03b-b92132375c47',
        artistbackground: [
          { id: '1', url: 'https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/artistbackground/pink-floyd-bg.jpg', likes: '10' },
        ],
      };

      const result = parseFanartTvArtistResponse(response);
      expect(result).toBe('https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/artistbackground/pink-floyd-bg.jpg');
    });

    it('should fall back to hdmusiclogo when no thumb or background', () => {
      const response: FanartTvArtistResponse = {
        name: 'Pink Floyd',
        mbid_id: '83d91898-7763-47d7-b03b-b92132375c47',
        hdmusiclogo: [
          { id: '1', url: 'https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/hdmusiclogo/pink-floyd-logo.png', likes: '10' },
        ],
      };

      const result = parseFanartTvArtistResponse(response);
      expect(result).toBe('https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/hdmusiclogo/pink-floyd-logo.png');
    });

    it('should return undefined when no images available', () => {
      const response: FanartTvArtistResponse = {
        name: 'Unknown Artist',
        mbid_id: 'some-mbid',
      };

      const result = parseFanartTvArtistResponse(response);
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty arrays', () => {
      const response: FanartTvArtistResponse = {
        name: 'Unknown Artist',
        mbid_id: 'some-mbid',
        artistthumb: [],
        artistbackground: [],
        hdmusiclogo: [],
      };

      const result = parseFanartTvArtistResponse(response);
      expect(result).toBeUndefined();
    });
  });

  describe('fetchArtistImage', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return artist image URL when found', async () => {
      const mockFetch = vi.fn()
        // First call: MusicBrainz artist search
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            artists: [
              {
                id: '83d91898-7763-47d7-b03b-b92132375c47',
                name: 'Pink Floyd',
                'sort-name': 'Pink Floyd',
                score: 100,
              },
            ],
          }),
        })
        // Second call: Fanart.tv
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            name: 'Pink Floyd',
            mbid_id: '83d91898-7763-47d7-b03b-b92132375c47',
            artistthumb: [
              { id: '1', url: 'https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/artistthumb/pink-floyd.jpg', likes: '10' },
            ],
          }),
        });

      global.fetch = mockFetch;

      const result = await fetchArtistImage('Pink Floyd', {
        fanartTvApiKey: 'test-api-key',
        userAgent: 'TestApp/1.0',
      });

      expect(result).toBe('https://assets.fanart.tv/fanart/music/83d91898-7763-47d7-b03b-b92132375c47/artistthumb/pink-floyd.jpg');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return undefined when artist not found in MusicBrainz', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ artists: [] }),
      });

      global.fetch = mockFetch;

      const result = await fetchArtistImage('Unknown Artist XYZ', {
        fanartTvApiKey: 'test-api-key',
        userAgent: 'TestApp/1.0',
      });

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return undefined when Fanart.tv has no images', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            artists: [
              {
                id: 'some-mbid',
                name: 'Some Artist',
                'sort-name': 'Some Artist',
                score: 100,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            name: 'Some Artist',
            mbid_id: 'some-mbid',
          }),
        });

      global.fetch = mockFetch;

      const result = await fetchArtistImage('Some Artist', {
        fanartTvApiKey: 'test-api-key',
        userAgent: 'TestApp/1.0',
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when Fanart.tv returns 404', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            artists: [
              {
                id: 'some-mbid',
                name: 'Some Artist',
                'sort-name': 'Some Artist',
                score: 100,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      global.fetch = mockFetch;

      const result = await fetchArtistImage('Some Artist', {
        fanartTvApiKey: 'test-api-key',
        userAgent: 'TestApp/1.0',
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when MusicBrainz API fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      global.fetch = mockFetch;

      const result = await fetchArtistImage('Pink Floyd', {
        fanartTvApiKey: 'test-api-key',
        userAgent: 'TestApp/1.0',
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when no API key provided', async () => {
      const result = await fetchArtistImage('Pink Floyd', {
        userAgent: 'TestApp/1.0',
      });

      expect(result).toBeUndefined();
    });
  });
});
