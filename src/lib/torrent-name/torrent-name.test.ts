/**
 * Torrent Name Parsing Tests
 *
 * Tests for extracting metadata from torrent names.
 */

import { describe, it, expect } from 'vitest';
import { extractArtistFromTorrentName } from './torrent-name';

describe('extractArtistFromTorrentName', () => {
  describe('standard "Artist - Album" patterns', () => {
    it('should extract artist from "Artist - Album" format', () => {
      expect(extractArtistFromTorrentName('Pink Floyd - The Dark Side of the Moon')).toBe('Pink Floyd');
    });

    it('should extract artist from "Artist - Album [FLAC]" format', () => {
      expect(extractArtistFromTorrentName('Pink Floyd - The Dark Side of the Moon [FLAC]')).toBe('Pink Floyd');
    });

    it('should extract artist from "Artist - Album (Year) [FLAC]" format', () => {
      expect(extractArtistFromTorrentName('Pink Floyd - The Dark Side of the Moon (1973) [FLAC]')).toBe('Pink Floyd');
    });

    it('should extract artist from "Artist - Discography [FLAC]" format', () => {
      expect(extractArtistFromTorrentName('Pink Floyd - Discography [FLAC]')).toBe('Pink Floyd');
    });

    it('should extract artist from "Artist - Discography (1967-2014) [FLAC]" format', () => {
      expect(extractArtistFromTorrentName('Pink Floyd - Discography (1967-2014) [FLAC]')).toBe('Pink Floyd');
    });
  });

  describe('artist names with special characters', () => {
    it('should handle artist names with apostrophes', () => {
      expect(extractArtistFromTorrentName("Guns N' Roses - Appetite for Destruction")).toBe("Guns N' Roses");
    });

    it('should handle artist names with ampersands', () => {
      expect(extractArtistFromTorrentName('Simon & Garfunkel - Bridge Over Troubled Water')).toBe('Simon & Garfunkel');
    });

    it('should handle artist names with periods', () => {
      expect(extractArtistFromTorrentName('Dr. Dre - The Chronic')).toBe('Dr. Dre');
    });

    it('should handle artist names with numbers', () => {
      expect(extractArtistFromTorrentName('Blink-182 - Enema of the State')).toBe('Blink');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for names without dash separator', () => {
      expect(extractArtistFromTorrentName('The Dark Side of the Moon')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(extractArtistFromTorrentName('')).toBeUndefined();
    });

    it('should trim whitespace from artist name', () => {
      expect(extractArtistFromTorrentName('  Pink Floyd   -   The Dark Side of the Moon')).toBe('Pink Floyd');
    });

    it('should handle multiple dashes by taking first segment', () => {
      expect(extractArtistFromTorrentName('AC-DC - Back in Black')).toBe('AC');
    });
  });

  describe('various quality tags', () => {
    it('should work with [MP3] tag', () => {
      expect(extractArtistFromTorrentName('The Beatles - Abbey Road [MP3]')).toBe('The Beatles');
    });

    it('should work with [320kbps] tag', () => {
      expect(extractArtistFromTorrentName('The Beatles - Abbey Road [320kbps]')).toBe('The Beatles');
    });

    it('should work with [24bit-96kHz] tag', () => {
      expect(extractArtistFromTorrentName('The Beatles - Abbey Road [24bit-96kHz]')).toBe('The Beatles');
    });

    it('should work with [WEB-FLAC] tag', () => {
      expect(extractArtistFromTorrentName('The Beatles - Abbey Road [WEB-FLAC]')).toBe('The Beatles');
    });
  });
});
