import { describe, it, expect } from 'vitest';
import {
  parseMagnetUri,
  validateMagnetUri,
  extractInfohash,
  normalizeMagnetUri,
  MagnetParseError,
  type ParsedMagnet,
} from './magnet';

describe('Magnet URI Parser', () => {
  describe('parseMagnetUri', () => {
    it('should parse a valid magnet URI with btih', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test+Torrent';
      const result = parseMagnetUri(magnetUri);

      expect(result.infohash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(result.displayName).toBe('Test Torrent');
      expect(result.trackers).toEqual([]);
    });

    it('should parse magnet URI with uppercase infohash', () => {
      const magnetUri = 'magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12';
      const result = parseMagnetUri(magnetUri);

      // Should normalize to lowercase
      expect(result.infohash).toBe('abcdef1234567890abcdef1234567890abcdef12');
    });

    it('should parse magnet URI with multiple trackers', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&tr=udp://tracker1.com:6969&tr=udp://tracker2.com:6969';
      const result = parseMagnetUri(magnetUri);

      expect(result.trackers).toHaveLength(2);
      expect(result.trackers).toContain('udp://tracker1.com:6969');
      expect(result.trackers).toContain('udp://tracker2.com:6969');
    });

    it('should parse magnet URI with URL-encoded display name', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=My%20Awesome%20Torrent%20%5B2024%5D';
      const result = parseMagnetUri(magnetUri);

      expect(result.displayName).toBe('My Awesome Torrent [2024]');
    });

    it('should parse magnet URI with exact length (xl) parameter', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&xl=1073741824';
      const result = parseMagnetUri(magnetUri);

      expect(result.exactLength).toBe(1073741824);
    });

    it('should parse magnet URI with web seed (ws) parameter', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&ws=https://example.com/file.torrent';
      const result = parseMagnetUri(magnetUri);

      expect(result.webSeeds).toContain('https://example.com/file.torrent');
    });

    it('should parse magnet URI with keyword topic (kt) parameter', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&kt=music+electronic+ambient';
      const result = parseMagnetUri(magnetUri);

      expect(result.keywords).toEqual(['music', 'electronic', 'ambient']);
    });

    it('should handle base32 encoded infohash', () => {
      // Base32 encoded infohash (32 characters)
      const magnetUri = 'magnet:?xt=urn:btih:CIHM6QCRIJ3GKZLWMVZXG33SNFXGO3TF';
      const result = parseMagnetUri(magnetUri);

      // Should convert to hex (40 characters)
      expect(result.infohash).toHaveLength(40);
      expect(result.infohash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('should throw MagnetParseError for invalid magnet URI scheme', () => {
      expect(() => parseMagnetUri('http://example.com')).toThrow(MagnetParseError);
      expect(() => parseMagnetUri('http://example.com')).toThrow('Invalid magnet URI: must start with "magnet:"');
    });

    it('should throw MagnetParseError for missing xt parameter', () => {
      expect(() => parseMagnetUri('magnet:?dn=Test')).toThrow(MagnetParseError);
      expect(() => parseMagnetUri('magnet:?dn=Test')).toThrow('Invalid magnet URI: missing xt parameter');
    });

    it('should throw MagnetParseError for invalid xt format', () => {
      expect(() => parseMagnetUri('magnet:?xt=invalid')).toThrow(MagnetParseError);
      expect(() => parseMagnetUri('magnet:?xt=invalid')).toThrow('Invalid magnet URI: xt must be urn:btih format');
    });

    it('should throw MagnetParseError for invalid infohash length', () => {
      expect(() => parseMagnetUri('magnet:?xt=urn:btih:tooshort')).toThrow(MagnetParseError);
      expect(() => parseMagnetUri('magnet:?xt=urn:btih:tooshort')).toThrow('Invalid infohash');
    });

    it('should throw MagnetParseError for invalid infohash characters', () => {
      // 40 characters but with invalid hex characters
      expect(() => parseMagnetUri('magnet:?xt=urn:btih:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toThrow(MagnetParseError);
    });

    it('should throw MagnetParseError for empty string', () => {
      expect(() => parseMagnetUri('')).toThrow(MagnetParseError);
    });

    it('should handle magnet URI with no display name', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const result = parseMagnetUri(magnetUri);

      expect(result.displayName).toBeUndefined();
    });
  });

  describe('validateMagnetUri', () => {
    it('should return true for valid magnet URI', () => {
      expect(validateMagnetUri('magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678')).toBe(true);
    });

    it('should return false for invalid magnet URI', () => {
      expect(validateMagnetUri('http://example.com')).toBe(false);
      expect(validateMagnetUri('magnet:?dn=Test')).toBe(false);
      expect(validateMagnetUri('')).toBe(false);
      expect(validateMagnetUri('magnet:?xt=urn:btih:invalid')).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(validateMagnetUri(null as unknown as string)).toBe(false);
      expect(validateMagnetUri(undefined as unknown as string)).toBe(false);
      expect(validateMagnetUri(123 as unknown as string)).toBe(false);
    });
  });

  describe('extractInfohash', () => {
    it('should extract infohash from valid magnet URI', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test';
      expect(extractInfohash(magnetUri)).toBe('1234567890abcdef1234567890abcdef12345678');
    });

    it('should normalize infohash to lowercase', () => {
      const magnetUri = 'magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12';
      expect(extractInfohash(magnetUri)).toBe('abcdef1234567890abcdef1234567890abcdef12');
    });

    it('should throw for invalid magnet URI', () => {
      expect(() => extractInfohash('invalid')).toThrow(MagnetParseError);
    });
  });

  describe('normalizeMagnetUri', () => {
    it('should normalize magnet URI with consistent parameter order', () => {
      const magnetUri = 'magnet:?tr=udp://tracker.com&dn=Test&xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const normalized = normalizeMagnetUri(magnetUri);

      // xt should come first
      expect(normalized.startsWith('magnet:?xt=urn:btih:')).toBe(true);
    });

    it('should lowercase the infohash', () => {
      const magnetUri = 'magnet:?xt=urn:btih:ABCDEF1234567890ABCDEF1234567890ABCDEF12';
      const normalized = normalizeMagnetUri(magnetUri);

      expect(normalized).toContain('abcdef1234567890abcdef1234567890abcdef12');
    });

    it('should preserve display name', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=My+Torrent';
      const normalized = normalizeMagnetUri(magnetUri);

      expect(normalized).toContain('dn=My+Torrent');
    });

    it('should preserve trackers', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&tr=udp://tracker.com:6969';
      const normalized = normalizeMagnetUri(magnetUri);

      // Trackers are URL-encoded in normalized output
      expect(normalized).toContain('tr=udp%3A%2F%2Ftracker.com%3A6969');
    });

    it('should deduplicate trackers', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&tr=udp://tracker.com&tr=udp://tracker.com';
      const normalized = normalizeMagnetUri(magnetUri);

      // Count occurrences of tracker (URL-encoded)
      const matches = normalized.match(/tr=udp%3A%2F%2Ftracker\.com/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('ParsedMagnet type', () => {
    it('should have correct structure', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Test&xl=1000&tr=udp://tracker.com&ws=https://seed.com&kt=music+rock';
      const result: ParsedMagnet = parseMagnetUri(magnetUri);

      expect(result).toHaveProperty('infohash');
      expect(result).toHaveProperty('displayName');
      expect(result).toHaveProperty('trackers');
      expect(result).toHaveProperty('exactLength');
      expect(result).toHaveProperty('webSeeds');
      expect(result).toHaveProperty('keywords');
    });
  });

  describe('Edge cases', () => {
    it('should handle magnet URI with special characters in display name', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=%E4%B8%AD%E6%96%87%E5%90%8D%E7%A7%B0';
      const result = parseMagnetUri(magnetUri);

      expect(result.displayName).toBe('中文名称');
    });

    it('should handle magnet URI with very long display name', () => {
      const longName = 'A'.repeat(500);
      const magnetUri = `magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=${longName}`;
      const result = parseMagnetUri(magnetUri);

      expect(result.displayName).toBe(longName);
    });

    it('should handle magnet URI with many trackers', () => {
      const trackers = Array.from({ length: 50 }, (_, i) => `tr=udp://tracker${i}.com:6969`).join('&');
      const magnetUri = `magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&${trackers}`;
      const result = parseMagnetUri(magnetUri);

      expect(result.trackers).toHaveLength(50);
    });

    it('should handle whitespace around magnet URI', () => {
      const magnetUri = '  magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678  ';
      const result = parseMagnetUri(magnetUri);

      expect(result.infohash).toBe('1234567890abcdef1234567890abcdef12345678');
    });

    it('should handle magnet URI with fragment', () => {
      const magnetUri = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678#fragment';
      const result = parseMagnetUri(magnetUri);

      expect(result.infohash).toBe('1234567890abcdef1234567890abcdef12345678');
    });
  });
});
