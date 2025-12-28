/**
 * Album Cover Art Tests
 *
 * Tests for extracting album info from file paths and fetching cover art.
 */

import { describe, it, expect } from 'vitest';
import {
  extractAlbumInfoFromPath,
  buildAlbumSearchQuery,
} from './album-cover';

describe('extractAlbumInfoFromPath', () => {
  describe('standard discography structures', () => {
    it('should extract artist and album from "Artist/Album/track.flac" structure', () => {
      const result = extractAlbumInfoFromPath('Metallica/Master of Puppets (1986)/01 - Battery.flac');
      expect(result).toEqual({
        artist: 'Metallica',
        album: 'Master of Puppets',
        year: 1986,
      });
    });

    it('should extract artist and album from "Artist/Album [Year]/track.flac" structure', () => {
      const result = extractAlbumInfoFromPath('Pink Floyd/The Dark Side of the Moon [1973]/01 - Speak to Me.flac');
      expect(result).toEqual({
        artist: 'Pink Floyd',
        album: 'The Dark Side of the Moon',
        year: 1973,
      });
    });

    it('should extract artist and album from "Artist - Discography/Album/track.flac" structure', () => {
      const result = extractAlbumInfoFromPath('Metallica - Discography (1983-2016)/Master of Puppets (1986)/01 - Battery.flac');
      expect(result).toEqual({
        artist: 'Metallica',
        album: 'Master of Puppets',
        year: 1986,
      });
    });

    it('should handle album names with special characters', () => {
      const result = extractAlbumInfoFromPath("Guns N' Roses/Appetite for Destruction (1987)/01 - Welcome to the Jungle.flac");
      expect(result).toEqual({
        artist: "Guns N' Roses",
        album: 'Appetite for Destruction',
        year: 1987,
      });
    });
  });

  describe('year extraction', () => {
    it('should extract year from parentheses', () => {
      const result = extractAlbumInfoFromPath('Artist/Album Name (2020)/track.flac');
      expect(result?.year).toBe(2020);
    });

    it('should extract year from brackets', () => {
      const result = extractAlbumInfoFromPath('Artist/Album Name [2020]/track.flac');
      expect(result?.year).toBe(2020);
    });

    it('should handle album without year', () => {
      const result = extractAlbumInfoFromPath('Artist/Album Name/track.flac');
      expect(result).toEqual({
        artist: 'Artist',
        album: 'Album Name',
        year: undefined,
      });
    });
  });

  describe('edge cases', () => {
    it('should return null for flat structure (no folders)', () => {
      const result = extractAlbumInfoFromPath('track.flac');
      expect(result).toBeNull();
    });

    it('should return null for single folder structure', () => {
      const result = extractAlbumInfoFromPath('Album/track.flac');
      expect(result).toBeNull();
    });

    it('should handle deeply nested structures', () => {
      const result = extractAlbumInfoFromPath('Music/Rock/Metallica/Master of Puppets (1986)/01 - Battery.flac');
      // Should use the last two meaningful folders
      expect(result?.album).toBe('Master of Puppets');
    });

    it('should clean up format tags from album name', () => {
      const result = extractAlbumInfoFromPath('Artist/Album Name [FLAC]/track.flac');
      expect(result?.album).toBe('Album Name');
    });

    it('should clean up quality tags from album name', () => {
      const result = extractAlbumInfoFromPath('Artist/Album Name [24-96]/track.flac');
      expect(result?.album).toBe('Album Name');
    });
  });
});

describe('buildAlbumSearchQuery', () => {
  it('should build query with artist and album', () => {
    const query = buildAlbumSearchQuery('Metallica', 'Master of Puppets');
    expect(query).toBe('Metallica Master of Puppets');
  });

  it('should handle special characters', () => {
    const query = buildAlbumSearchQuery("Guns N' Roses", 'Appetite for Destruction');
    expect(query).toBe("Guns N' Roses Appetite for Destruction");
  });

  it('should trim whitespace', () => {
    const query = buildAlbumSearchQuery('  Artist  ', '  Album  ');
    expect(query).toBe('Artist Album');
  });
});
