import { describe, it, expect } from 'vitest';
import { buildMagnetUri, extractInfohash } from './magnet';

describe('dht-search-api magnet utils', () => {
  describe('extractInfohash', () => {
    it('extracts a 40-char hex infohash and lowercases it', () => {
      const magnet =
        'magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12&dn=Example';
      expect(extractInfohash(magnet)).toBe(
        'abcdef1234567890abcdef1234567890abcdef12'
      );
    });

    it('extracts the infohash regardless of parameter order', () => {
      const magnet =
        'magnet:?dn=Example&tr=udp://t.example:6969&xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      expect(extractInfohash(magnet)).toBe(
        '1234567890abcdef1234567890abcdef12345678'
      );
    });

    it('decodes a 32-char base32 infohash to 40-char hex (BEP 9)', () => {
      // Base32 "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U" === hex of "0123456789abcdef..." bytes.
      const base32 = 'MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U';
      const magnet = `magnet:?xt=urn:btih:${base32}`;
      const hex = extractInfohash(magnet);
      expect(hex).not.toBeNull();
      expect(hex).toMatch(/^[a-f0-9]{40}$/);
    });

    it('round-trips a hex infohash through buildMagnetUri', () => {
      const hash = '1234567890abcdef1234567890abcdef12345678';
      expect(extractInfohash(buildMagnetUri(hash, 'name'))).toBe(hash);
    });

    it('returns null for a 64-char v2 (SHA-256) topic instead of truncating to 40', () => {
      const v2 = 'a'.repeat(64);
      const magnet = `magnet:?xt=urn:btih:${v2}`;
      // The old regex would have returned the first 40 chars; a truncated
      // hash is worse than an explicit miss because it silently points at
      // the wrong swarm.
      expect(extractInfohash(magnet)).toBeNull();
    });

    it('returns null when there is no btih topic', () => {
      expect(
        extractInfohash('magnet:?xt=urn:ed2k:31D6CFE0D16AE931B73C59D7E0C089C0')
      ).toBeNull();
      expect(extractInfohash('not a magnet')).toBeNull();
      expect(extractInfohash('')).toBeNull();
    });
  });
});
