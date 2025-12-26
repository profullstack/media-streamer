/**
 * Xtream Codes Tests
 * 
 * TDD tests for Xtream Codes API integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createXtreamProvider,
  validateXtreamCredentials,
  buildXtreamUrl,
  buildLiveStreamUrl,
  buildVodStreamUrl,
  buildSeriesStreamUrl,
  parseXtreamResponse,
  getXtreamCategories,
  getXtreamLiveStreams,
  getXtreamVodStreams,
  getXtreamSeries,
  getXtreamEPG,
  formatXtreamChannel,
  XtreamProvider,
  XtreamCredentials,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamEPGEntry,
  XtreamStreamType,
} from './xtream';

describe('Xtream Codes', () => {
  describe('Provider Management', () => {
    it('should create a new Xtream provider', () => {
      const provider = createXtreamProvider({
        name: 'My IPTV',
        serverUrl: 'http://example.com:8080',
        username: 'user123',
        password: 'pass456',
      });

      expect(provider.id).toBeDefined();
      expect(provider.name).toBe('My IPTV');
      expect(provider.serverUrl).toBe('http://example.com:8080');
      expect(provider.username).toBe('user123');
      expect(provider.password).toBe('pass456');
      expect(provider.createdAt).toBeInstanceOf(Date);
    });

    it('should normalize server URL', () => {
      const provider = createXtreamProvider({
        name: 'Test',
        serverUrl: 'http://example.com:8080/',
        username: 'user',
        password: 'pass',
      });

      // Should remove trailing slash
      expect(provider.serverUrl).toBe('http://example.com:8080');
    });

    it('should validate provider has required fields', () => {
      const provider = createXtreamProvider({
        name: 'Test',
        serverUrl: 'http://example.com:8080',
        username: 'user',
        password: 'pass',
      });

      expect(provider.name).toBeTruthy();
      expect(provider.serverUrl).toBeTruthy();
      expect(provider.username).toBeTruthy();
      expect(provider.password).toBeTruthy();
    });
  });

  describe('Credential Validation', () => {
    it('should validate correct credentials format', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'http://example.com:8080',
        username: 'user123',
        password: 'pass456',
      };

      expect(validateXtreamCredentials(credentials)).toBe(true);
    });

    it('should reject empty server URL', () => {
      const credentials: XtreamCredentials = {
        serverUrl: '',
        username: 'user',
        password: 'pass',
      };

      expect(validateXtreamCredentials(credentials)).toBe(false);
    });

    it('should reject empty username', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'http://example.com:8080',
        username: '',
        password: 'pass',
      };

      expect(validateXtreamCredentials(credentials)).toBe(false);
    });

    it('should reject empty password', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'http://example.com:8080',
        username: 'user',
        password: '',
      };

      expect(validateXtreamCredentials(credentials)).toBe(false);
    });

    it('should reject invalid URL format', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'not-a-url',
        username: 'user',
        password: 'pass',
      };

      expect(validateXtreamCredentials(credentials)).toBe(false);
    });

    it('should accept HTTPS URLs', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'https://example.com:8080',
        username: 'user',
        password: 'pass',
      };

      expect(validateXtreamCredentials(credentials)).toBe(true);
    });
  });

  describe('URL Building', () => {
    const credentials: XtreamCredentials = {
      serverUrl: 'http://example.com:8080',
      username: 'user123',
      password: 'pass456',
    };

    it('should build player API URL', () => {
      const url = buildXtreamUrl(credentials, 'player_api.php');

      expect(url).toBe('http://example.com:8080/player_api.php?username=user123&password=pass456');
    });

    it('should build URL with additional parameters', () => {
      const url = buildXtreamUrl(credentials, 'player_api.php', {
        action: 'get_live_categories',
      });

      expect(url).toContain('action=get_live_categories');
    });

    it('should build live stream URL', () => {
      const url = buildLiveStreamUrl(credentials, '12345');

      expect(url).toBe('http://example.com:8080/live/user123/pass456/12345.ts');
    });

    it('should build live stream URL with custom extension', () => {
      const url = buildLiveStreamUrl(credentials, '12345', 'm3u8');

      expect(url).toBe('http://example.com:8080/live/user123/pass456/12345.m3u8');
    });

    it('should build VOD stream URL', () => {
      const url = buildVodStreamUrl(credentials, '67890');

      expect(url).toBe('http://example.com:8080/movie/user123/pass456/67890.mp4');
    });

    it('should build VOD stream URL with custom extension', () => {
      const url = buildVodStreamUrl(credentials, '67890', 'mkv');

      expect(url).toBe('http://example.com:8080/movie/user123/pass456/67890.mkv');
    });

    it('should build series stream URL', () => {
      const url = buildSeriesStreamUrl(credentials, '11111');

      expect(url).toBe('http://example.com:8080/series/user123/pass456/11111.mp4');
    });
  });

  describe('Response Parsing', () => {
    it('should parse successful API response', () => {
      const response = {
        user_info: {
          username: 'user123',
          status: 'Active',
        },
        server_info: {
          url: 'example.com',
          port: '8080',
        },
      };

      const parsed = parseXtreamResponse(JSON.stringify(response));

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(response);
    });

    it('should handle invalid JSON', () => {
      const parsed = parseXtreamResponse('not valid json');

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    it('should handle empty response', () => {
      const parsed = parseXtreamResponse('');

      expect(parsed.success).toBe(false);
    });

    it('should handle authentication error response', () => {
      const response = {
        user_info: {
          auth: 0,
          status: 'Disabled',
        },
      };

      const parsed = parseXtreamResponse(JSON.stringify(response));

      expect(parsed.success).toBe(true);
      expect(parsed.data?.user_info?.auth).toBe(0);
    });
  });

  describe('Category Parsing', () => {
    it('should parse live categories', () => {
      const rawCategories = [
        { category_id: '1', category_name: 'Sports', parent_id: 0 },
        { category_id: '2', category_name: 'News', parent_id: 0 },
      ];

      const categories = getXtreamCategories(rawCategories, 'live');

      expect(categories).toHaveLength(2);
      expect(categories[0].id).toBe('1');
      expect(categories[0].name).toBe('Sports');
      expect(categories[0].type).toBe('live');
    });

    it('should parse VOD categories', () => {
      const rawCategories = [
        { category_id: '10', category_name: 'Movies', parent_id: 0 },
      ];

      const categories = getXtreamCategories(rawCategories, 'vod');

      expect(categories[0].type).toBe('vod');
    });

    it('should handle empty categories', () => {
      const categories = getXtreamCategories([], 'live');
      expect(categories).toHaveLength(0);
    });

    it('should handle null/undefined categories', () => {
      const categories = getXtreamCategories(null as unknown as unknown[], 'live');
      expect(categories).toHaveLength(0);
    });
  });

  describe('Live Stream Parsing', () => {
    it('should parse live streams', () => {
      const rawStreams = [
        {
          stream_id: 123,
          name: 'ESPN HD',
          stream_icon: 'http://logo.com/espn.png',
          category_id: '1',
          epg_channel_id: 'espn.us',
        },
      ];

      const streams = getXtreamLiveStreams(rawStreams);

      expect(streams).toHaveLength(1);
      expect(streams[0].id).toBe('123');
      expect(streams[0].name).toBe('ESPN HD');
      expect(streams[0].logo).toBe('http://logo.com/espn.png');
      expect(streams[0].categoryId).toBe('1');
      expect(streams[0].epgChannelId).toBe('espn.us');
    });

    it('should handle streams without logos', () => {
      const rawStreams = [
        { stream_id: 123, name: 'Channel', category_id: '1' },
      ];

      const streams = getXtreamLiveStreams(rawStreams);

      expect(streams[0].logo).toBeUndefined();
    });

    it('should handle empty streams', () => {
      const streams = getXtreamLiveStreams([]);
      expect(streams).toHaveLength(0);
    });
  });

  describe('VOD Stream Parsing', () => {
    it('should parse VOD streams', () => {
      const rawStreams = [
        {
          stream_id: 456,
          name: 'The Matrix',
          stream_icon: 'http://poster.com/matrix.jpg',
          category_id: '10',
          container_extension: 'mkv',
          rating: '8.7',
          plot: 'A computer hacker learns...',
        },
      ];

      const streams = getXtreamVodStreams(rawStreams);

      expect(streams).toHaveLength(1);
      expect(streams[0].id).toBe('456');
      expect(streams[0].name).toBe('The Matrix');
      expect(streams[0].poster).toBe('http://poster.com/matrix.jpg');
      expect(streams[0].extension).toBe('mkv');
      expect(streams[0].rating).toBe('8.7');
      expect(streams[0].plot).toBe('A computer hacker learns...');
    });

    it('should default to mp4 extension', () => {
      const rawStreams = [
        { stream_id: 456, name: 'Movie', category_id: '10' },
      ];

      const streams = getXtreamVodStreams(rawStreams);

      expect(streams[0].extension).toBe('mp4');
    });
  });

  describe('Series Parsing', () => {
    it('should parse series', () => {
      const rawSeries = [
        {
          series_id: 789,
          name: 'Breaking Bad',
          cover: 'http://poster.com/bb.jpg',
          category_id: '20',
          rating: '9.5',
          plot: 'A high school chemistry teacher...',
        },
      ];

      const series = getXtreamSeries(rawSeries);

      expect(series).toHaveLength(1);
      expect(series[0].id).toBe('789');
      expect(series[0].name).toBe('Breaking Bad');
      expect(series[0].cover).toBe('http://poster.com/bb.jpg');
      expect(series[0].rating).toBe('9.5');
    });

    it('should handle series without cover', () => {
      const rawSeries = [
        { series_id: 789, name: 'Show', category_id: '20' },
      ];

      const series = getXtreamSeries(rawSeries);

      expect(series[0].cover).toBeUndefined();
    });
  });

  describe('EPG Parsing', () => {
    it('should parse EPG entries', () => {
      const rawEPG = [
        {
          id: '1',
          epg_id: 'espn.us',
          title: 'NFL Game',
          start: '2024-01-01 20:00:00',
          end: '2024-01-01 23:00:00',
          description: 'Football game',
        },
      ];

      const epg = getXtreamEPG(rawEPG);

      expect(epg).toHaveLength(1);
      expect(epg[0].id).toBe('1');
      expect(epg[0].channelId).toBe('espn.us');
      expect(epg[0].title).toBe('NFL Game');
      expect(epg[0].start).toBeInstanceOf(Date);
      expect(epg[0].end).toBeInstanceOf(Date);
    });

    it('should handle EPG without description', () => {
      const rawEPG = [
        {
          id: '1',
          epg_id: 'ch1',
          title: 'Show',
          start: '2024-01-01 20:00:00',
          end: '2024-01-01 21:00:00',
        },
      ];

      const epg = getXtreamEPG(rawEPG);

      expect(epg[0].description).toBeUndefined();
    });

    it('should handle empty EPG', () => {
      const epg = getXtreamEPG([]);
      expect(epg).toHaveLength(0);
    });
  });

  describe('Channel Formatting', () => {
    it('should format Xtream stream as M3U channel', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'http://example.com:8080',
        username: 'user',
        password: 'pass',
      };

      const stream: XtreamLiveStream = {
        id: '123',
        name: 'ESPN HD',
        logo: 'http://logo.com/espn.png',
        categoryId: '1',
        epgChannelId: 'espn.us',
      };

      const channel = formatXtreamChannel(credentials, stream);

      expect(channel.id).toBe('123');
      expect(channel.name).toBe('ESPN HD');
      expect(channel.url).toContain('/live/user/pass/123');
      expect(channel.tvgLogo).toBe('http://logo.com/espn.png');
      expect(channel.tvgId).toBe('espn.us');
    });

    it('should handle stream without EPG ID', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'http://example.com:8080',
        username: 'user',
        password: 'pass',
      };

      const stream: XtreamLiveStream = {
        id: '123',
        name: 'Channel',
        categoryId: '1',
      };

      const channel = formatXtreamChannel(credentials, stream);

      expect(channel.tvgId).toBeUndefined();
    });
  });

  describe('Stream Type Detection', () => {
    it('should identify live stream type', () => {
      const type: XtreamStreamType = 'live';
      expect(type).toBe('live');
    });

    it('should identify VOD stream type', () => {
      const type: XtreamStreamType = 'vod';
      expect(type).toBe('vod');
    });

    it('should identify series stream type', () => {
      const type: XtreamStreamType = 'series';
      expect(type).toBe('series');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in credentials', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'http://example.com:8080',
        username: 'user@email.com',
        password: 'p@ss&word=123',
      };

      const url = buildXtreamUrl(credentials, 'player_api.php');

      // Should properly encode special characters
      expect(url).toContain(encodeURIComponent('user@email.com'));
      expect(url).toContain(encodeURIComponent('p@ss&word=123'));
    });

    it('should handle server URL with path', () => {
      const credentials: XtreamCredentials = {
        serverUrl: 'http://example.com:8080/iptv',
        username: 'user',
        password: 'pass',
      };

      const url = buildLiveStreamUrl(credentials, '123');

      expect(url).toBe('http://example.com:8080/iptv/live/user/pass/123.ts');
    });

    it('should handle numeric stream IDs', () => {
      const rawStreams = [
        { stream_id: 123, name: 'Channel', category_id: '1' },
      ];

      const streams = getXtreamLiveStreams(rawStreams);

      expect(streams[0].id).toBe('123');
      expect(typeof streams[0].id).toBe('string');
    });

    it('should handle string stream IDs', () => {
      const rawStreams = [
        { stream_id: '456', name: 'Channel', category_id: '1' },
      ];

      const streams = getXtreamLiveStreams(rawStreams);

      expect(streams[0].id).toBe('456');
    });
  });
});
