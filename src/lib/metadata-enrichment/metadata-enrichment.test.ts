/**
 * Metadata Enrichment Service Tests
 * 
 * Tests for automatic metadata fetching during torrent indexing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectContentType,
  extractSearchQuery,
  enrichTorrentMetadata,
  type ContentType,
  type EnrichmentOptions,
} from './metadata-enrichment';

// ============================================================================
// Content Type Detection Tests
// ============================================================================

describe('detectContentType', () => {
  describe('movie detection', () => {
    it('should detect movie with year and quality', () => {
      expect(detectContentType('The Matrix 1999 1080p BluRay x264')).toBe('movie');
    });

    it('should detect movie with quality and year', () => {
      expect(detectContentType('Inception.2010.720p.BRRip.x264')).toBe('movie');
    });

    it('should detect movie with 4K quality', () => {
      expect(detectContentType('Dune 2021 2160p 4K UHD BluRay')).toBe('movie');
    });

    it('should detect movie with IMAX tag', () => {
      expect(detectContentType('Oppenheimer 2023 IMAX 1080p')).toBe('movie');
    });

    it('should detect movie with directors cut', () => {
      expect(detectContentType('Blade Runner Directors Cut 1982 1080p')).toBe('movie');
    });

    it('should detect movie with extended edition', () => {
      expect(detectContentType('Lord of the Rings Extended 2001 BluRay')).toBe('movie');
    });

    it('should detect movie trilogy', () => {
      expect(detectContentType('The Lord of the Rings Trilogy 2002 1080p BluRay')).toBe('movie');
    });

    it('should detect movie collection with quality', () => {
      expect(detectContentType('Mission Impossible Collection 1080p BluRay')).toBe('movie');
    });

    it('should detect movie series with complete', () => {
      expect(detectContentType('The Bourne Series (complete) 2160p H.264')).toBe('movie');
    });

    it('should detect Pirates collection', () => {
      expect(detectContentType('Pirates of the Caribbean 1-5 Collection 2003-2017 1080p BluRay')).toBe('movie');
    });

    it('should detect complete movie with quality', () => {
      expect(detectContentType('The Hobbit Trilogy Complete 1080p BluRay')).toBe('movie');
    });
  });

  describe('TV show detection', () => {
    it('should detect TV show with S01E01 format', () => {
      expect(detectContentType('Breaking Bad S01E01 720p HDTV')).toBe('tvshow');
    });

    it('should detect TV show with S01 format', () => {
      expect(detectContentType('Game of Thrones S08 1080p WEB-DL')).toBe('tvshow');
    });

    it('should detect TV show with season word', () => {
      expect(detectContentType('The Office Season 3 720p')).toBe('tvshow');
    });

    it('should detect TV show with episode word', () => {
      expect(detectContentType('Friends Episode 10 HDTV')).toBe('tvshow');
    });

    it('should detect complete series', () => {
      expect(detectContentType('The Wire Complete Series 1080p')).toBe('tvshow');
    });

    it('should prioritize TV show over movie patterns', () => {
      // Has both year and S01E01 - should be TV show
      expect(detectContentType('Stranger Things 2016 S01E01 1080p')).toBe('tvshow');
    });
  });

  describe('music detection', () => {
    it('should detect music with FLAC format in brackets', () => {
      expect(detectContentType('Pink Floyd - The Dark Side of the Moon [FLAC]')).toBe('music');
    });

    it('should detect music with MP3 format in brackets', () => {
      expect(detectContentType('Beatles - Abbey Road [MP3 320]')).toBe('music');
    });

    it('should detect music with V0 quality', () => {
      expect(detectContentType('Radiohead - OK Computer [V0]')).toBe('music');
    });

    it('should detect various artists compilation', () => {
      expect(detectContentType('Various Artists - Best of 2023')).toBe('music');
    });

    it('should detect discography with FLAC', () => {
      expect(detectContentType('Led Zeppelin Discography 1969-1982 FLAC')).toBe('music');
    });

    // Additional discography patterns that should be detected
    it('should detect discography with parentheses format', () => {
      expect(detectContentType('Artist Name - Discography (1970-2020) FLAC')).toBe('music');
    });

    it('should detect discography without format tag', () => {
      expect(detectContentType('Pink Floyd - Complete Discography')).toBe('music');
    });

    it('should detect discography with year range', () => {
      expect(detectContentType('The Beatles - Discography 1963-1970')).toBe('music');
    });

    it('should detect FLAC without brackets (common torrent format)', () => {
      expect(detectContentType('Artist - Album Name 2020 FLAC 24bit')).toBe('music');
    });

    it('should detect FLAC with parentheses', () => {
      expect(detectContentType('Artist - Album Name (2020) (FLAC)')).toBe('music');
    });

    it('should detect lossless indicator', () => {
      expect(detectContentType('Artist - Album Name [Lossless]')).toBe('music');
    });

    it('should detect 24bit/hi-res indicator', () => {
      expect(detectContentType('Artist - Album 24-96 Hi-Res')).toBe('music');
    });

    it('should detect CD/vinyl rip indicator', () => {
      expect(detectContentType('Artist - Album [CD Rip]')).toBe('music');
    });

    it('should detect WEB release indicator', () => {
      expect(detectContentType('Artist - Album (2023) [WEB]')).toBe('music');
    });

    it('should detect complete works/collection', () => {
      expect(detectContentType('Mozart - Complete Works Collection')).toBe('music');
    });

    it('should detect studio albums collection', () => {
      expect(detectContentType('Artist - Studio Albums 1990-2020')).toBe('music');
    });
  });

  describe('book detection', () => {
    it('should detect EPUB format', () => {
      expect(detectContentType('Stephen King - The Shining.epub')).toBe('book');
    });

    it('should detect PDF format', () => {
      expect(detectContentType('Clean Code - Robert Martin [PDF]')).toBe('book');
    });

    it('should detect MOBI format', () => {
      expect(detectContentType('Harry Potter Collection [MOBI]')).toBe('book');
    });

    it('should detect AZW3 format', () => {
      expect(detectContentType('Dune - Frank Herbert.azw3')).toBe('book');
    });
  });

  describe('XXX/adult content detection', () => {
    it('should detect XXX keyword', () => {
      expect(detectContentType('Some Video XXX 1080p')).toBe('xxx');
    });

    it('should detect porn keyword', () => {
      expect(detectContentType('Adult Content Porn Collection')).toBe('xxx');
    });

    it('should detect adult keyword', () => {
      expect(detectContentType('Adult Video 2023')).toBe('xxx');
    });

    it('should detect 18+ keyword', () => {
      expect(detectContentType('Video 18+ Content')).toBe('xxx');
    });

    it('should detect NSFW keyword', () => {
      expect(detectContentType('NSFW Collection 2023')).toBe('xxx');
    });

    it('should detect adult studio names', () => {
      expect(detectContentType('Brazzers Collection 2023')).toBe('xxx');
    });

    it('should detect site rip with XXX', () => {
      expect(detectContentType('SomeStudio SiteRip XXX 1080p')).toBe('xxx');
    });

    it('should prioritize XXX over movie patterns', () => {
      // Has both movie patterns and XXX - should be XXX
      expect(detectContentType('Adult Movie XXX 2023 1080p BluRay')).toBe('xxx');
    });

    it('should prioritize XXX over TV show patterns', () => {
      // Has both TV patterns and XXX - should be XXX
      expect(detectContentType('Adult Show XXX S01E01 720p')).toBe('xxx');
    });
  });

  describe('other/unknown detection', () => {
    it('should return other for empty string', () => {
      expect(detectContentType('')).toBe('other');
    });

    it('should return other for whitespace only', () => {
      expect(detectContentType('   ')).toBe('other');
    });

    it('should return other for generic filename', () => {
      expect(detectContentType('random_file_name')).toBe('other');
    });

    it('should return other for software', () => {
      expect(detectContentType('Adobe Photoshop 2024 x64')).toBe('other');
    });
  });
});

// ============================================================================
// Search Query Extraction Tests
// ============================================================================

describe('extractSearchQuery', () => {
  describe('movie queries', () => {
    it('should extract clean movie title', () => {
      const result = extractSearchQuery('The Matrix 1999 1080p BluRay x264', 'movie');
      expect(result.query).toBe('The Matrix');
      expect(result.year).toBe(1999);
    });

    it('should handle dots in filename', () => {
      const result = extractSearchQuery('Inception.2010.720p.BRRip.x264', 'movie');
      expect(result.query).toBe('Inception');
      expect(result.year).toBe(2010);
    });

    it('should remove release group', () => {
      const result = extractSearchQuery('Dune 2021 1080p BluRay-SPARKS', 'movie');
      expect(result.query).toBe('Dune');
      expect(result.year).toBe(2021);
    });

    it('should handle brackets', () => {
      const result = extractSearchQuery('[YTS] Interstellar (2014) 1080p', 'movie');
      expect(result.query).toBe('Interstellar');
      expect(result.year).toBe(2014);
    });
  });

  describe('TV show queries', () => {
    it('should remove season/episode info', () => {
      const result = extractSearchQuery('Breaking Bad S01E01 720p HDTV', 'tvshow');
      expect(result.query).toBe('Breaking Bad');
      expect(result.year).toBeUndefined();
    });

    it('should remove season word', () => {
      const result = extractSearchQuery('The Office Season 3 720p', 'tvshow');
      expect(result.query).toBe('The Office');
    });

    it('should handle complex TV show names', () => {
      const result = extractSearchQuery('Game.of.Thrones.S08E06.1080p.WEB-DL', 'tvshow');
      expect(result.query).toBe('Game of Thrones');
    });
  });

  describe('music queries', () => {
    it('should preserve artist - album format', () => {
      const result = extractSearchQuery('Pink Floyd - The Dark Side of the Moon [FLAC]', 'music');
      expect(result.query).toContain('Pink Floyd');
      expect(result.query).toContain('Dark Side');
    });

    it('should handle year in music', () => {
      const result = extractSearchQuery('Beatles - Abbey Road 1969 [FLAC]', 'music');
      expect(result.year).toBe(1969);
    });
  });

  describe('book queries', () => {
    it('should extract book title', () => {
      const result = extractSearchQuery('Stephen King - The Shining [EPUB]', 'book');
      expect(result.query).toContain('Stephen King');
      expect(result.query).toContain('Shining');
    });
  });

  describe('edge cases', () => {
    it('should handle very long names', () => {
      const longName = 'A'.repeat(300) + ' 2020 1080p';
      const result = extractSearchQuery(longName, 'movie');
      expect(result.query.length).toBeLessThanOrEqual(200);
    });

    it('should handle multiple years', () => {
      const result = extractSearchQuery('2001 A Space Odyssey 1968 1080p', 'movie');
      // Should prefer the later year (release year)
      expect(result.year).toBe(1968);
    });

    it('should filter invalid years', () => {
      const result = extractSearchQuery('Movie 1800 1080p', 'movie');
      // 1800 is too old to be a valid release year
      expect(result.year).toBeUndefined();
    });
  });

  describe('problematic torrent names (real-world cases)', () => {
    // These tests cover real torrent names that were failing to get posters
    
    describe('TV show cleaning', () => {
      it('should clean All Creatures Great and Small with year and season', () => {
        const result = extractSearchQuery('All Creatures Great and Small 2020 S06 720p WEB-DL HEVC x265', 'tvshow');
        expect(result.query).toBe('All Creatures Great and Small');
        expect(result.year).toBe(2020);
      });

      it('should clean dotted TV show name with season', () => {
        const result = extractSearchQuery('All.Creatures.Great.And.Small.2020.S01.COMPLETE.720p.PBS.WEB', 'tvshow');
        expect(result.query).toBe('All Creatures Great And Small');
        expect(result.year).toBe(2020);
      });

      it('should clean The Copenhagen Test with season and release group', () => {
        const result = extractSearchQuery('The.Copenhagen.Test.S01.1080p.WEB-DL-[Feranki1980]', 'tvshow');
        expect(result.query).toBe('The Copenhagen Test');
        // Should not have trailing dash or brackets
        expect(result.query).not.toContain('-');
        expect(result.query).not.toContain('[');
      });

      it('should clean Hunting Season with year', () => {
        const result = extractSearchQuery('Hunting Season 2025 1080p WEB H264-RGB.mp4', 'tvshow');
        expect(result.query).toBe('Hunting Season');
        expect(result.year).toBe(2025);
      });
    });

    describe('movie cleaning', () => {
      it('should clean The Bourne Series with DTS-HD audio', () => {
        const result = extractSearchQuery('The Bourne Series (complete) 2160p H.264 DTS-HD 7.1 AC3 ENG', 'movie');
        expect(result.query).toBe('The Bourne Series');
        // Should not have -HD leftover from DTS-HD
        expect(result.query).not.toContain('-HD');
        expect(result.query).not.toContain('HD');
      });

      it('should clean Avatar Fire and Ash with TS and EN', () => {
        const result = extractSearchQuery('Avatar.Fire.and.Ash.2025.1080p.TS.EN-RGB', 'movie');
        expect(result.query).toBe('Avatar Fire and Ash');
        expect(result.year).toBe(2025);
        // Should not have TS (telesync) or EN (language)
        expect(result.query).not.toContain('TS');
        expect(result.query).not.toContain('EN');
      });

      it('should clean Mission Impossible with hyphen in title', () => {
        const result = extractSearchQuery('Mission-Impossible - Dead Reckoning Part One.2023.1080p.H264', 'movie');
        // Should preserve the hyphen in Mission-Impossible but clean the rest
        expect(result.query).toContain('Mission');
        expect(result.query).toContain('Dead Reckoning Part One');
        expect(result.year).toBe(2023);
      });

      it('should clean The Social Network with 4K UHD REMUX', () => {
        const result = extractSearchQuery('The.Social.Network.2010.4K.UHD.2160p.REMUX.DV.TrueHD.7.1.DTS', 'movie');
        expect(result.query).toBe('The Social Network');
        expect(result.year).toBe(2010);
      });

      it('should clean movie with StarzPlay streaming service', () => {
        const result = extractSearchQuery('Mission Impossible - The Final Reckoning.2025.1080p.StarzPlay', 'movie');
        expect(result.query).toContain('Mission Impossible');
        expect(result.query).toContain('Final Reckoning');
        expect(result.year).toBe(2025);
        // Should not have StarzPlay
        expect(result.query).not.toContain('StarzPlay');
      });
    });

    describe('audio format cleaning', () => {
      it('should remove DTS-HD completely', () => {
        const result = extractSearchQuery('Movie 2020 1080p DTS-HD 7.1', 'movie');
        expect(result.query).not.toContain('DTS');
        expect(result.query).not.toContain('HD');
        expect(result.query).not.toContain('-HD');
      });

      it('should remove TrueHD', () => {
        const result = extractSearchQuery('Movie 2020 1080p TrueHD 7.1', 'movie');
        expect(result.query).not.toContain('TrueHD');
      });

      it('should remove AC3', () => {
        const result = extractSearchQuery('Movie 2020 1080p AC3', 'movie');
        expect(result.query).not.toContain('AC3');
      });

      it('should remove Dolby Vision (DV)', () => {
        const result = extractSearchQuery('Movie 2020 1080p DV', 'movie');
        expect(result.query).not.toContain('DV');
      });
    });

    describe('video format cleaning', () => {
      it('should remove TS (telesync)', () => {
        const result = extractSearchQuery('Movie 2020 1080p TS', 'movie');
        expect(result.query).not.toMatch(/\bTS\b/);
      });

      it('should remove CAM', () => {
        const result = extractSearchQuery('Movie 2020 CAM', 'movie');
        expect(result.query).not.toMatch(/\bCAM\b/);
      });

      it('should remove REMUX', () => {
        const result = extractSearchQuery('Movie 2020 REMUX', 'movie');
        expect(result.query).not.toContain('REMUX');
      });

      it('should remove UHD', () => {
        const result = extractSearchQuery('Movie 2020 4K UHD', 'movie');
        expect(result.query).not.toContain('UHD');
      });
    });

    describe('trailing artifacts', () => {
      it('should remove trailing dashes', () => {
        const result = extractSearchQuery('Movie Name 2020 1080p -', 'movie');
        expect(result.query).not.toMatch(/-\s*$/);
        expect(result.query.trim()).toBe(result.query);
      });

      it('should remove trailing numbers from audio channels', () => {
        const result = extractSearchQuery('Movie 2020 1080p 7 1', 'movie');
        // Should not have standalone 7 1 at the end
        expect(result.query).not.toMatch(/\b7\s*1\s*$/);
      });

      it('should remove release group with dots like MP4-BEN.THE.MEN', () => {
        const result = extractSearchQuery('The.Running.Man.2025.2160p.AMZN.WEB-DL.DV.HDR10+.DDP5.1.H265.MP4-BEN.THE.MEN', 'movie');
        expect(result.query).toBe('The Running Man');
        expect(result.year).toBe(2025);
        // Should not have -BEN THE or similar artifacts
        expect(result.query).not.toContain('BEN');
        expect(result.query).not.toContain('-');
      });
    });

    describe('movie titles with "Season" in the name', () => {
      it('should detect "Hunting Season" as a movie, not a TV show', () => {
        // "Hunting Season" is a movie - the word "Season" should not trigger TV show detection
        const contentType = detectContentType('Hunting.Season.2024.1080p.WEB-DL.x264-GROUP');
        expect(contentType).toBe('movie');
      });

      it('should extract correct query for "Hunting Season"', () => {
        const result = extractSearchQuery('Hunting.Season.2024.1080p.WEB-DL.x264-GROUP', 'movie');
        expect(result.query).toBe('Hunting Season');
        expect(result.year).toBe(2024);
      });

      it('should detect "Open Season" as a movie', () => {
        const contentType = detectContentType('Open.Season.2006.1080p.BluRay.x264');
        expect(contentType).toBe('movie');
      });

      it('should detect "Duck Season" as a movie', () => {
        const contentType = detectContentType('Duck.Season.2004.720p.WEB-DL');
        expect(contentType).toBe('movie');
      });

      it('should still detect actual TV shows with season numbers', () => {
        // This should be detected as TV show because it has "Season 1"
        const contentType = detectContentType('Breaking.Bad.Season.1.1080p.BluRay');
        expect(contentType).toBe('tvshow');
      });

      it('should detect S01E01 pattern as TV show', () => {
        const contentType = detectContentType('Game.of.Thrones.S01E01.1080p.BluRay');
        expect(contentType).toBe('tvshow');
      });

      it('should detect S01 pattern (full season, no episode) as TV show', () => {
        // Full season downloads often have just S01 without episode number
        const contentType = detectContentType('Breaking.Bad.S01.COMPLETE.1080p.BluRay');
        expect(contentType).toBe('tvshow');
      });

      it('should detect S08 pattern (full season, no episode) as TV show', () => {
        const contentType = detectContentType('Game.of.Thrones.S08.1080p.WEB-DL');
        expect(contentType).toBe('tvshow');
      });
    });
  });
});

// ============================================================================
// Metadata Enrichment Tests
// ============================================================================

describe('enrichTorrentMetadata', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('movie enrichment', () => {
    const options: EnrichmentOptions = {
      omdbApiKey: 'test-api-key',
    };

    it('should fetch movie metadata from OMDb', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Response: 'True',
          Search: [
            {
              Title: 'The Matrix',
              Year: '1999',
              imdbID: 'tt0133093',
              Poster: 'https://example.com/matrix.jpg',
            },
          ],
        }),
      });

      const result = await enrichTorrentMetadata('The Matrix 1999 1080p BluRay', options);

      expect(result.contentType).toBe('movie');
      expect(result.posterUrl).toBe('https://example.com/matrix.jpg');
      expect(result.externalId).toBe('tt0133093');
      expect(result.externalSource).toBe('omdb');
      expect(result.year).toBe(1999);
    });

    it('should handle OMDb API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await enrichTorrentMetadata('The Matrix 1999 1080p BluRay', options);

      expect(result.contentType).toBe('movie');
      expect(result.error).toContain('OMDb API error');
    });

    it('should handle no results from OMDb', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Response: 'False',
          Error: 'Movie not found!',
        }),
      });

      const result = await enrichTorrentMetadata('Unknown Movie 2099 1080p', options);

      expect(result.contentType).toBe('movie');
      expect(result.posterUrl).toBeUndefined();
    });

    it('should return error when OMDb API key not configured', async () => {
      const result = await enrichTorrentMetadata('The Matrix 1999 1080p BluRay', {});

      expect(result.contentType).toBe('movie');
      expect(result.error).toBe('OMDb API key not configured');
    });
  });

  describe('TV show enrichment', () => {
    const options: EnrichmentOptions = {
      omdbApiKey: 'test-omdb-key',
    };

    it('should fetch TV show metadata from OMDb', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Response: 'True',
          Search: [
            {
              Title: 'Breaking Bad',
              Year: '2008',
              imdbID: 'tt0903747',
              Type: 'series',
              Poster: 'https://example.com/breakingbad.jpg',
            },
          ],
        }),
      });

      const result = await enrichTorrentMetadata('Breaking Bad S01E01 720p HDTV', options);

      expect(result.contentType).toBe('tvshow');
      expect(result.posterUrl).toBe('https://example.com/breakingbad.jpg');
      expect(result.externalId).toBe('tt0903747');
      expect(result.externalSource).toBe('omdb');
    });

    it('should handle OMDb API error for TV shows', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await enrichTorrentMetadata('Breaking Bad S01E01 720p', options);

      expect(result.contentType).toBe('tvshow');
      expect(result.error).toContain('OMDb API error');
    });

    it('should return error when OMDb API key not configured for TV shows', async () => {
      const result = await enrichTorrentMetadata('Breaking Bad S01E01 720p', {});

      expect(result.contentType).toBe('tvshow');
      expect(result.error).toBe('OMDb API key not configured');
    });
  });

  describe('music enrichment', () => {
    it('should fetch music metadata from MusicBrainz using release-group for albums', async () => {
      // First call: MusicBrainz release-group search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'abc123',
              title: 'The Wall',
              'first-release-date': '1979-11-30',
              'artist-credit': [
                { name: 'Pink Floyd' },
              ],
              'primary-type': 'Album',
            },
          ],
        }),
      });
      // Second call: Cover Art Archive (may return 404)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await enrichTorrentMetadata('Pink Floyd - The Wall [FLAC]', {});

      expect(result.contentType).toBe('music');
      expect(result.externalId).toBe('abc123');
      expect(result.externalSource).toBe('musicbrainz');
      expect(result.year).toBe(1979);
    });

    it('should fetch cover art from Fanart.tv for release-groups', async () => {
      // First call: MusicBrainz release-group search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [
            {
              id: 'rg-123',
              title: 'The Dark Side of the Moon',
              'first-release-date': '1973-03-01',
              'artist-credit': [
                {
                  name: 'Pink Floyd',
                  artist: { id: 'pink-floyd-mbid', name: 'Pink Floyd' }
                },
              ],
            },
          ],
        }),
      });
      // Second call: MusicBrainz artist search (inside fetchAlbumCover)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artists: [
            {
              id: 'pink-floyd-mbid',
              name: 'Pink Floyd',
              'sort-name': 'Pink Floyd',
              score: 100,
            },
          ],
        }),
      });
      // Third call: Fanart.tv artist lookup
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          albums: {
            'rg-123': {
              albumcover: [{
                url: 'https://assets.fanart.tv/fanart/music/pink-floyd-mbid/albumcover/rg-123.jpg',
              }],
            },
          },
        }),
      });

      const result = await enrichTorrentMetadata('Pink Floyd - Dark Side of the Moon [FLAC]', {
        fanartTvApiKey: 'test-fanart-key',
      });

      expect(result.contentType).toBe('music');
      expect(result.coverUrl).toBe('https://assets.fanart.tv/fanart/music/pink-floyd-mbid/albumcover/rg-123.jpg');
    });

    it('should use custom user agent for MusicBrainz', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'release-groups': [],
        }),
      });

      await enrichTorrentMetadata('Pink Floyd - The Wall [FLAC]', {
        musicbrainzUserAgent: 'CustomApp/2.0.0',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'CustomApp/2.0.0',
          }),
        })
      );
    });

    it('should handle MusicBrainz API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await enrichTorrentMetadata('Pink Floyd - The Wall [FLAC]', {});

      expect(result.contentType).toBe('music');
      expect(result.error).toContain('MusicBrainz API error');
    });

    it('should use recording search for non-album music', async () => {
      // For torrents that don't look like albums, use recording search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recordings: [
            {
              id: 'rec-456',
              title: 'Comfortably Numb',
              'artist-credit': [
                { name: 'Pink Floyd' },
              ],
              releases: [
                { title: 'The Wall', date: '1979-11-30' },
              ],
            },
          ],
        }),
      });

      // Use a name that doesn't match the "Artist - Album" pattern
      const result = await enrichTorrentMetadata('Various Artists - Best Hits [MP3]', {});

      expect(result.contentType).toBe('music');
      // Various Artists triggers recording search, not release-group
    });
  });

  describe('book enrichment', () => {
    it('should fetch book metadata from Open Library', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: '/works/OL27448W',
              title: 'The Shining',
              author_name: ['Stephen King'],
              first_publish_year: 1977,
              cover_i: 8231856,
            },
          ],
        }),
      });

      const result = await enrichTorrentMetadata('Stephen King - The Shining [EPUB]', {});

      expect(result.contentType).toBe('book');
      expect(result.coverUrl).toContain('covers.openlibrary.org');
      expect(result.externalId).toBe('/works/OL27448W');
      expect(result.externalSource).toBe('openlibrary');
      expect(result.year).toBe(1977);
    });

    it('should handle Open Library API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await enrichTorrentMetadata('Stephen King - The Shining [EPUB]', {});

      expect(result.contentType).toBe('book');
      expect(result.error).toContain('Open Library API error');
    });
  });

  describe('other content type', () => {
    it('should skip enrichment for other content type', async () => {
      const result = await enrichTorrentMetadata('random_file.zip', {});

      expect(result.contentType).toBe('other');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('XXX content type', () => {
    it('should skip enrichment for XXX content type', async () => {
      const result = await enrichTorrentMetadata('Adult Video XXX 1080p', {});

      expect(result.contentType).toBe('xxx');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should detect XXX and not fetch external metadata', async () => {
      const result = await enrichTorrentMetadata('Brazzers Collection 2023', {
        omdbApiKey: 'test-key',
      });

      expect(result.contentType).toBe('xxx');
      expect(result.posterUrl).toBeUndefined();
      expect(result.externalId).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('contentTypeOverride option', () => {
    it('should use contentTypeOverride when provided', async () => {
      // Mock MusicBrainz response for music (recording search type since name doesn't match discography patterns)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recordings: [
            {
              id: 'test-123',
              title: 'Big Buck Bunny Soundtrack',
              'artist-credit': [{ name: 'Blender Foundation' }],
              releases: [{ title: 'Big Buck Bunny OST', date: '2008-05-30' }],
            },
          ],
        }),
      });

      // "Big Buck Bunny" would normally be detected as 'other' from name
      // but we override it to 'music'
      const result = await enrichTorrentMetadata('Big Buck Bunny', {
        contentTypeOverride: 'music',
      });

      expect(result.contentType).toBe('music');
      expect(result.externalId).toBe('test-123');
      expect(result.externalSource).toBe('musicbrainz');
    });

    it('should use contentTypeOverride for movie even without year/quality in name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Response: 'True',
          Search: [
            {
              Title: 'Sintel',
              Year: '2010',
              imdbID: 'tt1727587',
              Poster: 'https://example.com/sintel.jpg',
            },
          ],
        }),
      });

      // "Sintel" would normally be detected as 'other' from name
      // but we override it to 'movie'
      const result = await enrichTorrentMetadata('Sintel', {
        omdbApiKey: 'test-key',
        contentTypeOverride: 'movie',
      });

      expect(result.contentType).toBe('movie');
      expect(result.posterUrl).toBe('https://example.com/sintel.jpg');
      expect(result.externalId).toBe('tt1727587');
    });

    it('should fall back to name detection when no override provided', async () => {
      const result = await enrichTorrentMetadata('random_file.zip', {});

      expect(result.contentType).toBe('other');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await enrichTorrentMetadata('The Matrix 1999 1080p BluRay', {
        omdbApiKey: 'test-key',
      });

      expect(result.contentType).toBe('movie');
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const result = await enrichTorrentMetadata('The Matrix 1999 1080p BluRay', {
        omdbApiKey: 'test-key',
      });

      expect(result.contentType).toBe('movie');
      expect(result.error).toBe('Unknown error');
    });
  });
});
