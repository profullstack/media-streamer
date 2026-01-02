/**
 * M3U Parser Tests
 * 
 * Tests for parsing M3U/M3U8 playlist files for IPTV channels.
 */

import { describe, it, expect } from 'vitest';
import { parseM3U, searchChannels, type Channel } from './m3u-parser';

describe('M3U Parser', () => {
  describe('parseM3U', () => {
    it('parses a basic M3U playlist', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1,Channel One
http://example.com/stream1.m3u8
#EXTINF:-1,Channel Two
http://example.com/stream2.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(2);
      expect(channels[0]).toEqual({
        id: expect.any(String),
        name: 'Channel One',
        url: 'http://example.com/stream1.m3u8',
        logo: undefined,
        group: undefined,
        tvgId: undefined,
        tvgName: undefined,
      });
      expect(channels[1]).toEqual({
        id: expect.any(String),
        name: 'Channel Two',
        url: 'http://example.com/stream2.m3u8',
        logo: undefined,
        group: undefined,
        tvgId: undefined,
        tvgName: undefined,
      });
    });

    it('parses M3U with tvg-logo attribute', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-logo="http://example.com/logo.png",ESPN HD
http://example.com/espn.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe('ESPN HD');
      expect(channels[0].logo).toBe('http://example.com/logo.png');
    });

    it('parses M3U with group-title attribute', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1 group-title="Sports",ESPN HD
http://example.com/espn.m3u8
#EXTINF:-1 group-title="News",CNN
http://example.com/cnn.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(2);
      expect(channels[0].group).toBe('Sports');
      expect(channels[1].group).toBe('News');
    });

    it('parses M3U with tvg-id and tvg-name attributes', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="espn.us" tvg-name="ESPN US",ESPN HD
http://example.com/espn.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(1);
      expect(channels[0].tvgId).toBe('espn.us');
      expect(channels[0].tvgName).toBe('ESPN US');
    });

    it('parses M3U with all attributes', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="espn.us" tvg-name="ESPN US" tvg-logo="http://example.com/espn.png" group-title="Sports",ESPN HD
http://example.com/espn.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(1);
      expect(channels[0]).toEqual({
        id: expect.any(String),
        name: 'ESPN HD',
        url: 'http://example.com/espn.m3u8',
        logo: 'http://example.com/espn.png',
        group: 'Sports',
        tvgId: 'espn.us',
        tvgName: 'ESPN US',
      });
    });

    it('handles empty M3U content', () => {
      const channels = parseM3U('');
      expect(channels).toHaveLength(0);
    });

    it('handles M3U with only header', () => {
      const channels = parseM3U('#EXTM3U');
      expect(channels).toHaveLength(0);
    });

    it('handles M3U with Windows line endings (CRLF)', () => {
      const m3uContent = '#EXTM3U\r\n#EXTINF:-1,Channel One\r\nhttp://example.com/stream1.m3u8\r\n';

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe('Channel One');
    });

    it('handles M3U with quoted attribute values', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-logo="http://example.com/logo with spaces.png" group-title="HD Sports",ESPN HD
http://example.com/espn.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(1);
      expect(channels[0].logo).toBe('http://example.com/logo with spaces.png');
      expect(channels[0].group).toBe('HD Sports');
    });

    it('handles M3U with duration in EXTINF', () => {
      const m3uContent = `#EXTM3U
#EXTINF:123 tvg-logo="http://example.com/logo.png",Channel One
http://example.com/stream1.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe('Channel One');
    });

    it('skips invalid entries without URL', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1,Channel One
#EXTINF:-1,Channel Two
http://example.com/stream2.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe('Channel Two');
    });

    it('generates unique IDs for each channel', () => {
      const m3uContent = `#EXTM3U
#EXTINF:-1,Channel One
http://example.com/stream1.m3u8
#EXTINF:-1,Channel Two
http://example.com/stream2.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels[0].id).not.toBe(channels[1].id);
    });

    it('handles M3U with extra whitespace', () => {
      const m3uContent = `#EXTM3U

#EXTINF:-1,  Channel One  
  http://example.com/stream1.m3u8  

#EXTINF:-1,Channel Two
http://example.com/stream2.m3u8`;

      const channels = parseM3U(m3uContent);
      
      expect(channels).toHaveLength(2);
      expect(channels[0].name).toBe('Channel One');
      expect(channels[0].url).toBe('http://example.com/stream1.m3u8');
    });
  });

  describe('searchChannels', () => {
    const testChannels: Channel[] = [
      { id: '1', name: 'ESPN HD', url: 'http://example.com/espn.m3u8', group: 'Sports' },
      { id: '2', name: 'ESPN 2 HD', url: 'http://example.com/espn2.m3u8', group: 'Sports' },
      { id: '3', name: 'HD Sports Network', url: 'http://example.com/hdsports.m3u8', group: 'Sports' },
      { id: '4', name: 'CNN News', url: 'http://example.com/cnn.m3u8', group: 'News' },
      { id: '5', name: 'BBC World News HD', url: 'http://example.com/bbc.m3u8', group: 'News' },
      { id: '6', name: 'Fox News Channel', url: 'http://example.com/fox.m3u8', group: 'News' },
    ];

    it('searches by single word', () => {
      const results = searchChannels(testChannels, 'espn');
      
      expect(results).toHaveLength(2);
      expect(results.map(c => c.name)).toContain('ESPN HD');
      expect(results.map(c => c.name)).toContain('ESPN 2 HD');
    });

    it('searches by multiple words in order', () => {
      const results = searchChannels(testChannels, 'espn hd');
      
      expect(results).toHaveLength(2);
      expect(results.map(c => c.name)).toContain('ESPN HD');
      expect(results.map(c => c.name)).toContain('ESPN 2 HD');
    });

    it('searches by multiple words in any order', () => {
      const results = searchChannels(testChannels, 'hd espn');
      
      expect(results).toHaveLength(2);
      expect(results.map(c => c.name)).toContain('ESPN HD');
      expect(results.map(c => c.name)).toContain('ESPN 2 HD');
    });

    it('is case insensitive', () => {
      const results = searchChannels(testChannels, 'ESPN');
      
      expect(results).toHaveLength(2);
    });

    it('returns all channels when query is empty', () => {
      const results = searchChannels(testChannels, '');
      
      expect(results).toHaveLength(6);
    });

    it('returns all channels when query is whitespace only', () => {
      const results = searchChannels(testChannels, '   ');
      
      expect(results).toHaveLength(6);
    });

    it('returns empty array when no matches', () => {
      const results = searchChannels(testChannels, 'xyz123');
      
      expect(results).toHaveLength(0);
    });

    it('matches partial words', () => {
      const results = searchChannels(testChannels, 'esp');
      
      expect(results).toHaveLength(2);
    });

    it('requires all words to match', () => {
      const results = searchChannels(testChannels, 'espn news');
      
      expect(results).toHaveLength(0);
    });

    it('filters by group when provided', () => {
      const results = searchChannels(testChannels, '', 'Sports');
      
      expect(results).toHaveLength(3);
      expect(results.every(c => c.group === 'Sports')).toBe(true);
    });

    it('combines search query and group filter', () => {
      const results = searchChannels(testChannels, 'hd', 'News');
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('BBC World News HD');
    });

    it('handles special regex characters in search', () => {
      const channelsWithSpecialChars: Channel[] = [
        { id: '1', name: 'Channel (HD)', url: 'http://example.com/1.m3u8' },
        { id: '2', name: 'Channel [SD]', url: 'http://example.com/2.m3u8' },
        { id: '3', name: 'Channel $pecial', url: 'http://example.com/3.m3u8' },
      ];

      const results1 = searchChannels(channelsWithSpecialChars, '(hd)');
      expect(results1).toHaveLength(1);
      expect(results1[0].name).toBe('Channel (HD)');

      const results2 = searchChannels(channelsWithSpecialChars, '[sd]');
      expect(results2).toHaveLength(1);
      expect(results2[0].name).toBe('Channel [SD]');
    });

    it('trims search query', () => {
      const results = searchChannels(testChannels, '  espn  ');
      
      expect(results).toHaveLength(2);
    });

    it('searches adult content channels with multiple words', () => {
      const adultChannels: Channel[] = [
        { id: '1', name: 'XXX Cum Shot HD', url: 'http://example.com/1.m3u8', group: 'Adult' },
        { id: '2', name: 'XXX Hardcore', url: 'http://example.com/2.m3u8', group: 'Adult' },
        { id: '3', name: 'Cum Lovers XXX', url: 'http://example.com/3.m3u8', group: 'Adult' },
        { id: '4', name: 'Regular Channel', url: 'http://example.com/4.m3u8', group: 'General' },
      ];

      // Search for "xxx cum" should find channels with both words
      const results = searchChannels(adultChannels, 'xxx cum');
      
      expect(results).toHaveLength(2);
      expect(results.map(c => c.name)).toContain('XXX Cum Shot HD');
      expect(results.map(c => c.name)).toContain('Cum Lovers XXX');
    });

    it('searches adult content channels with reversed word order', () => {
      const adultChannels: Channel[] = [
        { id: '1', name: 'XXX Cum Shot HD', url: 'http://example.com/1.m3u8', group: 'Adult' },
        { id: '2', name: 'XXX Hardcore', url: 'http://example.com/2.m3u8', group: 'Adult' },
        { id: '3', name: 'Cum Lovers XXX', url: 'http://example.com/3.m3u8', group: 'Adult' },
        { id: '4', name: 'Regular Channel', url: 'http://example.com/4.m3u8', group: 'General' },
      ];

      // Search for "cum xxx" should find same channels as "xxx cum"
      const results = searchChannels(adultChannels, 'cum xxx');
      
      expect(results).toHaveLength(2);
      expect(results.map(c => c.name)).toContain('XXX Cum Shot HD');
      expect(results.map(c => c.name)).toContain('Cum Lovers XXX');
    });
  });
});
