import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { castClaimsFrom, createCastToken, isCastablePath, verifyCastToken } from './token';
import { threadCastToken } from './playlist';

const saved = { ...process.env };

beforeEach(() => {
  process.env.CAST_TOKEN_SECRET = 'test-secret';
});

afterEach(() => {
  process.env = { ...saved };
});

describe('cast tokens', () => {
  it('round-trips the user id and expiry', async () => {
    const now = 1_800_000_000_000;
    const { token, expiresAt } = await createCastToken('user-1', now, 60);
    expect(expiresAt).toBe(1_800_000_060);
    expect(await verifyCastToken(token, now)).toEqual({ userId: 'user-1', expiresAt });
  });

  it('rejects an expired token', async () => {
    const now = 1_800_000_000_000;
    const { token } = await createCastToken('user-1', now, 60);
    expect(await verifyCastToken(token, now + 61_000)).toBeNull();
  });

  it('rejects a tampered payload or signature', async () => {
    const { token } = await createCastToken('user-1');
    const [payload, sig] = token.split('.');
    const forged = btoa(`admin.${Math.floor(Date.now() / 1000) + 600}`).replace(/=+$/, '');
    expect(await verifyCastToken(`${forged}.${sig}`)).toBeNull();
    expect(await verifyCastToken(`${payload}.${sig}x`)).toBeNull();
    expect(await verifyCastToken('garbage')).toBeNull();
    expect(await verifyCastToken('')).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await createCastToken('user-1');
    process.env.CAST_TOKEN_SECRET = 'rotated';
    expect(await verifyCastToken(token)).toBeNull();
  });

  it('falls back to a key derived from the service role key', async () => {
    delete process.env.CAST_TOKEN_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    const { token } = await createCastToken('user-2');
    expect((await verifyCastToken(token))?.userId).toBe('user-2');
  });

  it('reads the ct parameter from a request URL', async () => {
    const { token } = await createCastToken('user-3');
    const url = `https://bittorrented.com/api/stream?infohash=abc&fileIndex=0&ct=${encodeURIComponent(token)}`;
    expect((await castClaimsFrom(url))?.userId).toBe('user-3');
    expect(await castClaimsFrom('https://bittorrented.com/api/stream')).toBeNull();
  });

  it('only opens media routes', () => {
    expect(isCastablePath('/api/stream')).toBe(true);
    expect(isCastablePath('/api/stream/hls/segment')).toBe(true);
    expect(isCastablePath('/api/iptv-proxy')).toBe(true);
    expect(isCastablePath('/api/radio/proxy')).toBe(true);
    expect(isCastablePath('/api/seedbox/stream')).toBe(true);
    expect(isCastablePath('/api/streams')).toBe(false);
    expect(isCastablePath('/api/admin/stats')).toBe(false);
    expect(isCastablePath('/api/radio/favorites')).toBe(false);
    expect(isCastablePath('/account')).toBe(false);
  });
});

describe('threadCastToken', () => {
  it('appends the token to our own segment, key and map URIs', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-MAP:URI="/api/stream/hls/segment?infohash=a&fileIndex=0&sessionId=s&file=init.mp4"',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://bittorrented.com/api/radio/proxy?u=k"',
      '#EXTINF:4.0,',
      '/api/stream/hls/segment?infohash=a&fileIndex=0&sessionId=s&file=segment0.m4s',
      '/api/iptv-proxy?url=abc',
    ].join('\n');
    const out = threadCastToken(playlist, 'tok', 'https://bittorrented.com').split('\n');
    expect(out[1]).toBe('#EXT-X-MAP:URI="/api/stream/hls/segment?infohash=a&fileIndex=0&sessionId=s&file=init.mp4&ct=tok"');
    expect(out[2]).toBe('#EXT-X-KEY:METHOD=AES-128,URI="https://bittorrented.com/api/radio/proxy?u=k&ct=tok"');
    expect(out[3]).toBe('#EXTINF:4.0,');
    expect(out[4]).toBe('/api/stream/hls/segment?infohash=a&fileIndex=0&sessionId=s&file=segment0.m4s&ct=tok');
    expect(out[5]).toBe('/api/iptv-proxy?url=abc&ct=tok');
  });

  it('never hands the token to another site or a non-media route', () => {
    const playlist = ['https://cdn.example.com/seg0.ts', '//cdn.example.com/seg1.ts', '/api/admin/stats'].join('\n');
    expect(threadCastToken(playlist, 'tok', 'https://bittorrented.com')).toBe(playlist);
  });

  it('is a no-op without a token and does not double-append', () => {
    expect(threadCastToken('/api/stream?x=1', null)).toBe('/api/stream?x=1');
    expect(threadCastToken('/api/stream?x=1&ct=old', 'tok')).toBe('/api/stream?x=1&ct=old');
  });
});
