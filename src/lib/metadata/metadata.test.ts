/**
 * Metadata Service Tests
 * 
 * Tests for metadata API integrations (MusicBrainz, Open Library, OMDb, TheTVDB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildMusicBrainzUrl,
  buildOpenLibraryUrl,
  buildOMDbUrl,
  buildTheTVDBUrl,
  parseMusicBrainzResponse,
  parseOpenLibraryResponse,
  parseOMDbResponse,
  parseTheTVDBResponse,
  MetadataType,
  MusicMetadata,
  BookMetadata,
  MovieMetadata,
  TVShowMetadata,
} from './metadata';

describe('Metadata Service', () => {
  describe('MusicBrainz', () => {
    describe('buildMusicBrainzUrl', () => {
      it('should build recording search URL', () => {
        const url = buildMusicBrainzUrl('recording', 'Bohemian Rhapsody');
        expect(url).toContain('musicbrainz.org/ws/2/recording');
        expect(url).toContain('query=Bohemian%20Rhapsody');
        expect(url).toContain('fmt=json');
      });

      it('should build artist search URL', () => {
        const url = buildMusicBrainzUrl('artist', 'Queen');
        expect(url).toContain('musicbrainz.org/ws/2/artist');
        expect(url).toContain('query=Queen');
      });

      it('should build release search URL', () => {
        const url = buildMusicBrainzUrl('release', 'A Night at the Opera');
        expect(url).toContain('musicbrainz.org/ws/2/release');
      });

      it('should encode special characters', () => {
        const url = buildMusicBrainzUrl('recording', 'Rock & Roll');
        expect(url).toContain('Rock%20%26%20Roll');
      });

      it('should include limit parameter', () => {
        const url = buildMusicBrainzUrl('recording', 'test', 10);
        expect(url).toContain('limit=10');
      });
    });

    describe('parseMusicBrainzResponse', () => {
      it('should parse recording response', () => {
        const response = {
          recordings: [
            {
              id: '123',
              title: 'Bohemian Rhapsody',
              'artist-credit': [{ name: 'Queen' }],
              releases: [{ title: 'A Night at the Opera', date: '1975-11-21' }],
              length: 354000,
            },
          ],
        };

        const result = parseMusicBrainzResponse(response, 'recording');
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: '123',
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          year: 1975,
          duration: 354,
          source: 'musicbrainz',
        });
      });

      it('should handle missing fields gracefully', () => {
        const response = {
          recordings: [
            {
              id: '456',
              title: 'Unknown Track',
            },
          ],
        };

        const result = parseMusicBrainzResponse(response, 'recording');
        expect(result).toHaveLength(1);
        expect(result[0].artist).toBeUndefined();
        expect(result[0].album).toBeUndefined();
      });

      it('should return empty array for empty response', () => {
        const result = parseMusicBrainzResponse({ recordings: [] }, 'recording');
        expect(result).toEqual([]);
      });
    });
  });

  describe('Open Library', () => {
    describe('buildOpenLibraryUrl', () => {
      it('should build search URL', () => {
        const url = buildOpenLibraryUrl('The Great Gatsby');
        expect(url).toContain('openlibrary.org/search.json');
        expect(url).toContain('q=The%20Great%20Gatsby');
      });

      it('should include limit parameter', () => {
        const url = buildOpenLibraryUrl('test', 5);
        expect(url).toContain('limit=5');
      });

      it('should encode special characters', () => {
        const url = buildOpenLibraryUrl("Harry Potter & the Philosopher's Stone");
        expect(url).toContain('Harry%20Potter');
      });
    });

    describe('parseOpenLibraryResponse', () => {
      it('should parse book response', () => {
        const response = {
          docs: [
            {
              key: '/works/OL123',
              title: 'The Great Gatsby',
              author_name: ['F. Scott Fitzgerald'],
              first_publish_year: 1925,
              isbn: ['9780743273565'],
              cover_i: 12345,
              number_of_pages_median: 180,
              publisher: ['Scribner'],
            },
          ],
        };

        const result = parseOpenLibraryResponse(response);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: '/works/OL123',
          title: 'The Great Gatsby',
          author: 'F. Scott Fitzgerald',
          year: 1925,
          isbn: '9780743273565',
          coverUrl: 'https://covers.openlibrary.org/b/id/12345-M.jpg',
          pages: 180,
          publisher: 'Scribner',
          source: 'openlibrary',
        });
      });

      it('should handle multiple authors', () => {
        const response = {
          docs: [
            {
              key: '/works/OL456',
              title: 'Good Omens',
              author_name: ['Terry Pratchett', 'Neil Gaiman'],
            },
          ],
        };

        const result = parseOpenLibraryResponse(response);
        expect(result[0].author).toBe('Terry Pratchett, Neil Gaiman');
      });

      it('should handle missing cover', () => {
        const response = {
          docs: [
            {
              key: '/works/OL789',
              title: 'Unknown Book',
            },
          ],
        };

        const result = parseOpenLibraryResponse(response);
        expect(result[0].coverUrl).toBeUndefined();
      });
    });
  });

  describe('OMDb', () => {
    describe('buildOMDbUrl', () => {
      it('should build search URL', () => {
        const url = buildOMDbUrl('Inception', 'test-api-key');
        expect(url).toContain('omdbapi.com');
        expect(url).toContain('s=Inception');
        expect(url).toContain('apikey=test-api-key');
      });

      it('should build search URL with year', () => {
        const url = buildOMDbUrl('Inception', 'test-api-key', 2010);
        expect(url).toContain('y=2010');
      });

      it('should build search URL with type', () => {
        const url = buildOMDbUrl('Breaking Bad', 'test-api-key', undefined, 'series');
        expect(url).toContain('type=series');
      });

      it('should encode special characters', () => {
        const url = buildOMDbUrl('The Lord of the Rings', 'key');
        expect(url).toContain('The%20Lord%20of%20the%20Rings');
      });
    });

    describe('parseOMDbResponse', () => {
      it('should parse movie search response', () => {
        const response = {
          Search: [
            {
              imdbID: 'tt1375666',
              Title: 'Inception',
              Year: '2010',
              Type: 'movie',
              Poster: 'https://example.com/poster.jpg',
            },
          ],
          totalResults: '1',
          Response: 'True',
        };

        const result = parseOMDbResponse(response);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: 'tt1375666',
          title: 'Inception',
          year: 2010,
          type: 'movie',
          posterUrl: 'https://example.com/poster.jpg',
          source: 'omdb',
        });
      });

      it('should handle N/A poster', () => {
        const response = {
          Search: [
            {
              imdbID: 'tt0000001',
              Title: 'Old Movie',
              Year: '1900',
              Type: 'movie',
              Poster: 'N/A',
            },
          ],
          Response: 'True',
        };

        const result = parseOMDbResponse(response);
        expect(result[0].posterUrl).toBeUndefined();
      });

      it('should return empty array for failed response', () => {
        const response = {
          Response: 'False',
          Error: 'Movie not found!',
        };

        const result = parseOMDbResponse(response);
        expect(result).toEqual([]);
      });
    });
  });

  describe('TheTVDB', () => {
    describe('buildTheTVDBUrl', () => {
      it('should build search URL', () => {
        const url = buildTheTVDBUrl('Breaking Bad');
        expect(url).toContain('api4.thetvdb.com/v4/search');
        expect(url).toContain('query=Breaking%20Bad');
      });

      it('should include type parameter', () => {
        const url = buildTheTVDBUrl('Breaking Bad', 'series');
        expect(url).toContain('type=series');
      });

      it('should include limit parameter', () => {
        const url = buildTheTVDBUrl('test', undefined, 10);
        expect(url).toContain('limit=10');
      });
    });

    describe('parseTheTVDBResponse', () => {
      it('should parse TV show response', () => {
        const response = {
          status: 'success',
          data: [
            {
              id: '81189',
              name: 'Breaking Bad',
              year: '2008',
              type: 'series',
              image_url: 'https://example.com/image.jpg',
              overview: 'A high school chemistry teacher...',
              network: 'AMC',
            },
          ],
        };

        const result = parseTheTVDBResponse(response);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          id: '81189',
          title: 'Breaking Bad',
          year: 2008,
          type: 'series',
          imageUrl: 'https://example.com/image.jpg',
          overview: 'A high school chemistry teacher...',
          network: 'AMC',
          source: 'thetvdb',
        });
      });

      it('should handle missing fields', () => {
        const response = {
          status: 'success',
          data: [
            {
              id: '12345',
              name: 'Unknown Show',
            },
          ],
        };

        const result = parseTheTVDBResponse(response);
        expect(result[0].year).toBeUndefined();
        expect(result[0].overview).toBeUndefined();
      });

      it('should return empty array for failed response', () => {
        const response = {
          status: 'failure',
          data: [],
        };

        const result = parseTheTVDBResponse(response);
        expect(result).toEqual([]);
      });
    });
  });

  describe('MetadataType', () => {
    it('should include all metadata types', () => {
      const types: MetadataType[] = ['music', 'book', 'movie', 'tvshow'];
      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });
});
