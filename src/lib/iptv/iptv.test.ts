/**
 * IPTV Module Tests
 * 
 * TDD tests for M3U playlist parsing and EPG management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseM3U,
  parseM3ULine,
  parseExtInf,
  parseAttributes,
  validateM3UContent,
  generateM3U,
  parseEPGUrl,
  validateEPGUrl,
  createPlaylist,
  addChannel,
  removeChannel,
  updateChannel,
  getChannelsByGroup,
  searchChannels,
  sortChannels,
  filterChannels,
  mergePlaylist,
  exportPlaylist,
  M3UChannel,
  M3UPlaylist,
  EPGSource,
  ChannelGroup,
} from './iptv';

describe('IPTV Module', () => {
  describe('M3U Parsing', () => {
    it('should parse a simple M3U playlist', () => {
      const m3u = `#EXTM3U
#EXTINF:-1,Channel 1
http://example.com/stream1.m3u8
#EXTINF:-1,Channel 2
http://example.com/stream2.m3u8`;

      const result = parseM3U(m3u);

      expect(result.channels).toHaveLength(2);
      expect(result.channels[0].name).toBe('Channel 1');
      expect(result.channels[0].url).toBe('http://example.com/stream1.m3u8');
      expect(result.channels[1].name).toBe('Channel 2');
    });

    it('should parse M3U with attributes', () => {
      const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="ch1" tvg-name="Channel One" tvg-logo="http://logo.com/1.png" group-title="News",Channel 1
http://example.com/stream1.m3u8`;

      const result = parseM3U(m3u);

      expect(result.channels[0].tvgId).toBe('ch1');
      expect(result.channels[0].tvgName).toBe('Channel One');
      expect(result.channels[0].tvgLogo).toBe('http://logo.com/1.png');
      expect(result.channels[0].groupTitle).toBe('News');
    });

    it('should parse M3U with x-tvg-url header', () => {
      const m3u = `#EXTM3U x-tvg-url="http://epg.example.com/guide.xml"
#EXTINF:-1,Channel 1
http://example.com/stream1.m3u8`;

      const result = parseM3U(m3u);

      expect(result.epgUrl).toBe('http://epg.example.com/guide.xml');
    });

    it('should handle empty M3U', () => {
      const m3u = '#EXTM3U';
      const result = parseM3U(m3u);

      expect(result.channels).toHaveLength(0);
    });

    it('should skip invalid entries', () => {
      const m3u = `#EXTM3U
#EXTINF:-1,Valid Channel
http://example.com/valid.m3u8
Invalid line without EXTINF
#EXTINF:-1,Another Valid
http://example.com/another.m3u8`;

      const result = parseM3U(m3u);

      expect(result.channels).toHaveLength(2);
    });

    it('should parse duration from EXTINF', () => {
      const m3u = `#EXTM3U
#EXTINF:120,Channel with duration
http://example.com/stream.m3u8`;

      const result = parseM3U(m3u);

      expect(result.channels[0].duration).toBe(120);
    });
  });

  describe('EXTINF Parsing', () => {
    it('should parse simple EXTINF line', () => {
      const line = '#EXTINF:-1,Channel Name';
      const result = parseExtInf(line);

      expect(result.duration).toBe(-1);
      expect(result.name).toBe('Channel Name');
    });

    it('should parse EXTINF with attributes', () => {
      const line = '#EXTINF:-1 tvg-id="abc" tvg-logo="http://logo.png",Channel Name';
      const result = parseExtInf(line);

      expect(result.tvgId).toBe('abc');
      expect(result.tvgLogo).toBe('http://logo.png');
      expect(result.name).toBe('Channel Name');
    });

    it('should handle EXTINF with special characters in name', () => {
      const line = '#EXTINF:-1,Channel: News & Sports (HD)';
      const result = parseExtInf(line);

      expect(result.name).toBe('Channel: News & Sports (HD)');
    });

    it('should parse catchup attributes', () => {
      const line = '#EXTINF:-1 catchup="default" catchup-days="7",Channel';
      const result = parseExtInf(line);

      expect(result.catchup).toBe('default');
      expect(result.catchupDays).toBe(7);
    });
  });

  describe('Attribute Parsing', () => {
    it('should parse key-value attributes', () => {
      const attrs = 'tvg-id="ch1" tvg-name="Channel" group-title="Sports"';
      const result = parseAttributes(attrs);

      expect(result['tvg-id']).toBe('ch1');
      expect(result['tvg-name']).toBe('Channel');
      expect(result['group-title']).toBe('Sports');
    });

    it('should handle attributes with spaces in values', () => {
      const attrs = 'tvg-name="My Channel Name" group-title="News & Sports"';
      const result = parseAttributes(attrs);

      expect(result['tvg-name']).toBe('My Channel Name');
      expect(result['group-title']).toBe('News & Sports');
    });

    it('should handle empty attributes', () => {
      const result = parseAttributes('');
      expect(result).toEqual({});
    });

    it('should handle malformed attributes gracefully', () => {
      const attrs = 'tvg-id=noquotes tvg-name="valid"';
      const result = parseAttributes(attrs);

      expect(result['tvg-name']).toBe('valid');
    });
  });

  describe('M3U Validation', () => {
    it('should validate correct M3U content', () => {
      const m3u = '#EXTM3U\n#EXTINF:-1,Channel\nhttp://example.com/stream.m3u8';
      expect(validateM3UContent(m3u)).toBe(true);
    });

    it('should reject content without EXTM3U header', () => {
      const m3u = '#EXTINF:-1,Channel\nhttp://example.com/stream.m3u8';
      expect(validateM3UContent(m3u)).toBe(false);
    });

    it('should reject empty content', () => {
      expect(validateM3UContent('')).toBe(false);
      expect(validateM3UContent('   ')).toBe(false);
    });

    it('should accept M3U with only header', () => {
      expect(validateM3UContent('#EXTM3U')).toBe(true);
    });
  });

  describe('M3U Generation', () => {
    it('should generate valid M3U from channels', () => {
      const channels: M3UChannel[] = [
        {
          id: '1',
          name: 'Channel 1',
          url: 'http://example.com/1.m3u8',
          duration: -1,
        },
        {
          id: '2',
          name: 'Channel 2',
          url: 'http://example.com/2.m3u8',
          duration: -1,
        },
      ];

      const m3u = generateM3U(channels);

      expect(m3u).toContain('#EXTM3U');
      expect(m3u).toContain('#EXTINF:-1,Channel 1');
      expect(m3u).toContain('http://example.com/1.m3u8');
      expect(m3u).toContain('#EXTINF:-1,Channel 2');
    });

    it('should include attributes in generated M3U', () => {
      const channels: M3UChannel[] = [
        {
          id: '1',
          name: 'Channel 1',
          url: 'http://example.com/1.m3u8',
          duration: -1,
          tvgId: 'ch1',
          tvgLogo: 'http://logo.com/1.png',
          groupTitle: 'News',
        },
      ];

      const m3u = generateM3U(channels);

      expect(m3u).toContain('tvg-id="ch1"');
      expect(m3u).toContain('tvg-logo="http://logo.com/1.png"');
      expect(m3u).toContain('group-title="News"');
    });

    it('should include EPG URL in header', () => {
      const channels: M3UChannel[] = [];
      const epgUrl = 'http://epg.example.com/guide.xml';

      const m3u = generateM3U(channels, { epgUrl });

      expect(m3u).toContain(`x-tvg-url="${epgUrl}"`);
    });
  });

  describe('EPG URL Handling', () => {
    it('should parse valid EPG URL', () => {
      const url = 'http://epg.example.com/guide.xml';
      const result = parseEPGUrl(url);

      expect(result.url).toBe(url);
      expect(result.format).toBe('xmltv');
    });

    it('should detect XMLTV format', () => {
      expect(parseEPGUrl('http://example.com/guide.xml').format).toBe('xmltv');
      expect(parseEPGUrl('http://example.com/epg.xmltv').format).toBe('xmltv');
    });

    it('should detect JSON format', () => {
      expect(parseEPGUrl('http://example.com/guide.json').format).toBe('json');
    });

    it('should validate EPG URLs', () => {
      expect(validateEPGUrl('http://example.com/guide.xml')).toBe(true);
      expect(validateEPGUrl('https://example.com/guide.xml')).toBe(true);
      expect(validateEPGUrl('invalid-url')).toBe(false);
      expect(validateEPGUrl('')).toBe(false);
    });
  });

  describe('Playlist Management', () => {
    it('should create a new playlist', () => {
      const playlist = createPlaylist({
        name: 'My Playlist',
        userId: 'user-123',
      });

      expect(playlist.id).toBeDefined();
      expect(playlist.name).toBe('My Playlist');
      expect(playlist.userId).toBe('user-123');
      expect(playlist.channels).toHaveLength(0);
      expect(playlist.createdAt).toBeInstanceOf(Date);
    });

    it('should add channel to playlist', () => {
      const playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      const channel: M3UChannel = {
        id: 'ch-1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      };

      const updated = addChannel(playlist, channel);

      expect(updated.channels).toHaveLength(1);
      expect(updated.channels[0].name).toBe('Channel 1');
    });

    it('should not add duplicate channels', () => {
      const playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      const channel: M3UChannel = {
        id: 'ch-1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      };

      const first = addChannel(playlist, channel);
      const second = addChannel(first, channel);

      expect(second.channels).toHaveLength(1);
    });

    it('should remove channel from playlist', () => {
      const playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      const channel: M3UChannel = {
        id: 'ch-1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      };

      const withChannel = addChannel(playlist, channel);
      const removed = removeChannel(withChannel, 'ch-1');

      expect(removed.channels).toHaveLength(0);
    });

    it('should update channel in playlist', () => {
      const playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      const channel: M3UChannel = {
        id: 'ch-1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      };

      const withChannel = addChannel(playlist, channel);
      const updated = updateChannel(withChannel, 'ch-1', { name: 'Updated Channel' });

      expect(updated.channels[0].name).toBe('Updated Channel');
      expect(updated.channels[0].url).toBe('http://example.com/1.m3u8');
    });
  });

  describe('Channel Grouping', () => {
    let playlist: M3UPlaylist;

    beforeEach(() => {
      playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      playlist = addChannel(playlist, {
        id: '1',
        name: 'News 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
        groupTitle: 'News',
      });
      playlist = addChannel(playlist, {
        id: '2',
        name: 'Sports 1',
        url: 'http://example.com/2.m3u8',
        duration: -1,
        groupTitle: 'Sports',
      });
      playlist = addChannel(playlist, {
        id: '3',
        name: 'News 2',
        url: 'http://example.com/3.m3u8',
        duration: -1,
        groupTitle: 'News',
      });
    });

    it('should get channels by group', () => {
      const newsChannels = getChannelsByGroup(playlist, 'News');

      expect(newsChannels).toHaveLength(2);
      expect(newsChannels[0].name).toBe('News 1');
      expect(newsChannels[1].name).toBe('News 2');
    });

    it('should return empty array for non-existent group', () => {
      const channels = getChannelsByGroup(playlist, 'Movies');
      expect(channels).toHaveLength(0);
    });

    it('should get all unique groups', () => {
      const groups = [...new Set(playlist.channels.map(c => c.groupTitle).filter(Boolean))];
      expect(groups).toContain('News');
      expect(groups).toContain('Sports');
      expect(groups).toHaveLength(2);
    });
  });

  describe('Channel Search', () => {
    let playlist: M3UPlaylist;

    beforeEach(() => {
      playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      playlist = addChannel(playlist, {
        id: '1',
        name: 'BBC News',
        url: 'http://example.com/1.m3u8',
        duration: -1,
        groupTitle: 'News',
      });
      playlist = addChannel(playlist, {
        id: '2',
        name: 'ESPN Sports',
        url: 'http://example.com/2.m3u8',
        duration: -1,
        groupTitle: 'Sports',
      });
      playlist = addChannel(playlist, {
        id: '3',
        name: 'CNN News',
        url: 'http://example.com/3.m3u8',
        duration: -1,
        groupTitle: 'News',
      });
    });

    it('should search channels by name', () => {
      const results = searchChannels(playlist, 'News');

      expect(results).toHaveLength(2);
      expect(results.map(c => c.name)).toContain('BBC News');
      expect(results.map(c => c.name)).toContain('CNN News');
    });

    it('should search case-insensitively', () => {
      const results = searchChannels(playlist, 'espn');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('ESPN Sports');
    });

    it('should return empty for no matches', () => {
      const results = searchChannels(playlist, 'xyz');
      expect(results).toHaveLength(0);
    });

    it('should search in group title', () => {
      const results = searchChannels(playlist, 'Sports');
      expect(results).toHaveLength(1);
    });
  });

  describe('Channel Sorting', () => {
    let playlist: M3UPlaylist;

    beforeEach(() => {
      playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      playlist = addChannel(playlist, {
        id: '1',
        name: 'Zebra Channel',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      });
      playlist = addChannel(playlist, {
        id: '2',
        name: 'Alpha Channel',
        url: 'http://example.com/2.m3u8',
        duration: -1,
      });
      playlist = addChannel(playlist, {
        id: '3',
        name: 'Beta Channel',
        url: 'http://example.com/3.m3u8',
        duration: -1,
      });
    });

    it('should sort channels by name ascending', () => {
      const sorted = sortChannels(playlist.channels, 'name', 'asc');

      expect(sorted[0].name).toBe('Alpha Channel');
      expect(sorted[1].name).toBe('Beta Channel');
      expect(sorted[2].name).toBe('Zebra Channel');
    });

    it('should sort channels by name descending', () => {
      const sorted = sortChannels(playlist.channels, 'name', 'desc');

      expect(sorted[0].name).toBe('Zebra Channel');
      expect(sorted[2].name).toBe('Alpha Channel');
    });
  });

  describe('Channel Filtering', () => {
    let playlist: M3UPlaylist;

    beforeEach(() => {
      playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      playlist = addChannel(playlist, {
        id: '1',
        name: 'HD Channel',
        url: 'http://example.com/1.m3u8',
        duration: -1,
        groupTitle: 'HD',
        tvgLogo: 'http://logo.com/1.png',
      });
      playlist = addChannel(playlist, {
        id: '2',
        name: 'SD Channel',
        url: 'http://example.com/2.m3u8',
        duration: -1,
        groupTitle: 'SD',
      });
    });

    it('should filter channels with logos', () => {
      const filtered = filterChannels(playlist.channels, { hasLogo: true });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('HD Channel');
    });

    it('should filter channels by group', () => {
      const filtered = filterChannels(playlist.channels, { group: 'HD' });
      expect(filtered).toHaveLength(1);
    });

    it('should combine multiple filters', () => {
      const filtered = filterChannels(playlist.channels, { 
        group: 'HD',
        hasLogo: true,
      });
      expect(filtered).toHaveLength(1);
    });
  });

  describe('Playlist Merging', () => {
    it('should merge two playlists', () => {
      const playlist1 = createPlaylist({ name: 'Playlist 1', userId: 'user-1' });
      const playlist2 = createPlaylist({ name: 'Playlist 2', userId: 'user-1' });

      const p1 = addChannel(playlist1, {
        id: '1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      });

      const p2 = addChannel(playlist2, {
        id: '2',
        name: 'Channel 2',
        url: 'http://example.com/2.m3u8',
        duration: -1,
      });

      const merged = mergePlaylist(p1, p2);

      expect(merged.channels).toHaveLength(2);
    });

    it('should deduplicate channels when merging', () => {
      const playlist1 = createPlaylist({ name: 'Playlist 1', userId: 'user-1' });
      const playlist2 = createPlaylist({ name: 'Playlist 2', userId: 'user-1' });

      const channel: M3UChannel = {
        id: '1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      };

      const p1 = addChannel(playlist1, channel);
      const p2 = addChannel(playlist2, channel);

      const merged = mergePlaylist(p1, p2);

      expect(merged.channels).toHaveLength(1);
    });
  });

  describe('Playlist Export', () => {
    it('should export playlist as M3U string', () => {
      let playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      playlist = addChannel(playlist, {
        id: '1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      });

      const exported = exportPlaylist(playlist, 'M3U');

      expect(exported).toContain('#EXTM3U');
      expect(exported).toContain('Channel 1');
    });

    it('should export playlist as JSON', () => {
      let playlist = createPlaylist({ name: 'Test', userId: 'user-1' });
      playlist = addChannel(playlist, {
        id: '1',
        name: 'Channel 1',
        url: 'http://example.com/1.m3u8',
        duration: -1,
      });

      const exported = exportPlaylist(playlist, 'JSON');
      const parsed = JSON.parse(exported);

      expect(parsed.name).toBe('Test');
      expect(parsed.channels).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle M3U with Windows line endings', () => {
      const m3u = '#EXTM3U\r\n#EXTINF:-1,Channel 1\r\nhttp://example.com/1.m3u8';
      const result = parseM3U(m3u);

      expect(result.channels).toHaveLength(1);
    });

    it('should handle M3U with extra whitespace', () => {
      const m3u = `#EXTM3U
      
#EXTINF:-1,Channel 1
http://example.com/1.m3u8

`;
      const result = parseM3U(m3u);

      expect(result.channels).toHaveLength(1);
    });

    it('should handle channels with query parameters in URL', () => {
      const m3u = `#EXTM3U
#EXTINF:-1,Channel 1
http://example.com/stream.m3u8?token=abc123&quality=hd`;

      const result = parseM3U(m3u);

      expect(result.channels[0].url).toBe('http://example.com/stream.m3u8?token=abc123&quality=hd');
    });

    it('should handle unicode channel names', () => {
      const m3u = `#EXTM3U
#EXTINF:-1,日本テレビ
http://example.com/jp.m3u8`;

      const result = parseM3U(m3u);

      expect(result.channels[0].name).toBe('日本テレビ');
    });
  });
});
