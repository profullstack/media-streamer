import { describe, expect, it } from 'vitest';
import { guessContentType, isCastableUrl } from './sender';

describe('guessContentType', () => {
  it('reads torrent, IPTV and radio HLS routes as HLS', () => {
    expect(guessContentType({ url: '/api/stream/hls?infohash=a&fileIndex=0' })).toBe('application/x-mpegURL');
    expect(guessContentType({ url: `/api/iptv-proxy?url=${encodeURIComponent('http://x/live.m3u8')}` })).toBe('application/x-mpegURL');
    expect(guessContentType({ url: 'https://cdn.example.com/live/index.m3u8?token=1' })).toBe('application/x-mpegURL');
  });

  it('uses the filename when the URL has no extension', () => {
    expect(guessContentType({ url: '/api/stream?infohash=a&fileIndex=0', filename: 'Film.mp4' })).toBe('video/mp4');
    expect(guessContentType({ url: '/api/stream?infohash=a&fileIndex=3', filename: '03 Song.flac' })).toBe('audio/flac');
    expect(guessContentType({ url: 'https://feeds.example.com/ep1.mp3' })).toBe('audio/mpeg');
  });

  it('prefers an explicit type, then falls back on the kind', () => {
    expect(guessContentType({ url: '/api/x', contentType: 'audio/aac' })).toBe('audio/aac');
    expect(guessContentType({ url: '/api/x', kind: 'audio' })).toBe('audio/mpeg');
    expect(guessContentType({ url: '/api/x' })).toBe('video/mp4');
  });
});

describe('isCastableUrl', () => {
  it('accepts our API routes and http(s) URLs', () => {
    expect(isCastableUrl('/api/stream?infohash=a')).toBe(true);
    expect(isCastableUrl('https://feeds.example.com/ep1.mp3')).toBe(true);
  });

  it('rejects what only this tab can reach', () => {
    expect(isCastableUrl('blob:https://bittorrented.com/1234')).toBe(false);
    expect(isCastableUrl('/webtorrent/abc/0')).toBe(false);
    expect(isCastableUrl('data:audio/mp3;base64,AAA')).toBe(false);
    expect(isCastableUrl(null)).toBe(false);
  });
});
