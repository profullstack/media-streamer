import { describe, expect, it } from 'vitest';

import { parseMagnet } from './magnet';

describe('parseMagnet', () => {
  it('parses a 40-char hex infohash and lowercases it', () => {
    const hash = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
    const result = parseMagnet(`magnet:?xt=urn:btih:${hash}&dn=Some+Movie`);
    expect(result).toEqual({ infohash: hash.toLowerCase(), name: 'Some Movie' });
  });

  it('decodes a 32-char base32 infohash to hex', () => {
    // Base32 of 20 zero bytes = "AAAA…" (32 A's) → 40 hex zeros.
    const b32 = 'A'.repeat(32);
    const result = parseMagnet(`magnet:?xt=urn:btih:${b32}`);
    expect(result?.infohash).toBe('0'.repeat(40));
    expect(result?.name).toBeNull();
  });

  it('returns null for a non-magnet string', () => {
    expect(parseMagnet('https://example.com')).toBeNull();
    expect(parseMagnet('')).toBeNull();
  });

  it('returns null when no btih xt is present', () => {
    expect(parseMagnet('magnet:?xt=urn:sha1:abc&dn=x')).toBeNull();
  });

  it('picks the v1 btih among multiple xt values', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    const result = parseMagnet(`magnet:?xt=urn:btmh:foo&xt=urn:btih:${hash}`);
    expect(result?.infohash).toBe(hash);
  });
});
