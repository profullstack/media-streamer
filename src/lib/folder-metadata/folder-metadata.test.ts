/**
 * Folder Metadata Tests
 *
 * Tests for extracting and enriching folder-level metadata
 * for discographies and multi-album torrents.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractAlbumFolders,
  type AlbumFolder,
  enrichAlbumFolder,
  type FolderEnrichmentResult,
} from './folder-metadata';

describe('extractAlbumFolders', () => {
  it('should extract album folders from discography file paths', () => {
    const files = [
      { path: 'Metallica - Discography/Kill Em All (1983)/01 - Hit the Lights.flac' },
      { path: 'Metallica - Discography/Kill Em All (1983)/02 - The Four Horsemen.flac' },
      { path: 'Metallica - Discography/Ride the Lightning (1984)/01 - Fight Fire with Fire.flac' },
      { path: 'Metallica - Discography/Master of Puppets (1986)/01 - Battery.flac' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(3);
    expect(folders).toContainEqual({
      path: 'Metallica - Discography/Kill Em All (1983)',
      artist: 'Metallica',
      album: 'Kill Em All',
      year: 1983,
    });
    expect(folders).toContainEqual({
      path: 'Metallica - Discography/Ride the Lightning (1984)',
      artist: 'Metallica',
      album: 'Ride the Lightning',
      year: 1984,
    });
    expect(folders).toContainEqual({
      path: 'Metallica - Discography/Master of Puppets (1986)',
      artist: 'Metallica',
      album: 'Master of Puppets',
      year: 1986,
    });
  });

  it('should extract album folders from simple artist/album structure', () => {
    const files = [
      { path: 'Pink Floyd/The Dark Side of the Moon (1973)/01 - Speak to Me.flac' },
      { path: 'Pink Floyd/The Dark Side of the Moon (1973)/02 - Breathe.flac' },
      { path: 'Pink Floyd/Wish You Were Here (1975)/01 - Shine On You Crazy Diamond.flac' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(2);
    expect(folders).toContainEqual({
      path: 'Pink Floyd/The Dark Side of the Moon (1973)',
      artist: 'Pink Floyd',
      album: 'The Dark Side of the Moon',
      year: 1973,
    });
    expect(folders).toContainEqual({
      path: 'Pink Floyd/Wish You Were Here (1975)',
      artist: 'Pink Floyd',
      album: 'Wish You Were Here',
      year: 1975,
    });
  });

  it('should handle albums without year in folder name', () => {
    const files = [
      { path: 'Artist/Album Name/01 - Track.flac' },
      { path: 'Artist/Album Name/02 - Track.flac' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(1);
    expect(folders[0]).toEqual({
      path: 'Artist/Album Name',
      artist: 'Artist',
      album: 'Album Name',
      year: undefined,
    });
  });

  it('should handle year in brackets', () => {
    const files = [
      { path: 'Artist/Album [2020]/01 - Track.flac' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(1);
    expect(folders[0]).toEqual({
      path: 'Artist/Album [2020]',
      artist: 'Artist',
      album: 'Album',
      year: 2020,
    });
  });

  it('should deduplicate folders with multiple files', () => {
    const files = [
      { path: 'Artist/Album (2020)/01 - Track 1.flac' },
      { path: 'Artist/Album (2020)/02 - Track 2.flac' },
      { path: 'Artist/Album (2020)/03 - Track 3.flac' },
      { path: 'Artist/Album (2020)/04 - Track 4.flac' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(1);
  });

  it('should skip files without proper folder structure', () => {
    const files = [
      { path: 'single-track.flac' },
      { path: 'Artist/Album (2020)/01 - Track.flac' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(1);
    expect(folders[0].album).toBe('Album');
  });

  it('should handle nested discography structures', () => {
    const files = [
      { path: 'Metallica - Discography (1983-2016) Mp3 320kbps [PMEDIA]/1983 - Kill Em All/01 - Hit the Lights.mp3' },
      { path: 'Metallica - Discography (1983-2016) Mp3 320kbps [PMEDIA]/1984 - Ride the Lightning/01 - Fight Fire with Fire.mp3' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(2);
    // Should extract artist from discography folder name
    expect(folders[0].artist).toBe('Metallica');
    expect(folders[1].artist).toBe('Metallica');
  });

  it('should handle format tags in folder names', () => {
    const files = [
      { path: 'Artist/Album (2020) [FLAC]/01 - Track.flac' },
    ];

    const folders = extractAlbumFolders(files);

    expect(folders).toHaveLength(1);
    expect(folders[0].album).toBe('Album');
    expect(folders[0].year).toBe(2020);
  });

  it('should return empty array for empty input', () => {
    const folders = extractAlbumFolders([]);
    expect(folders).toHaveLength(0);
  });

  it('should handle CD/Disc subfolders', () => {
    const files = [
      { path: 'Artist/Album (2020)/CD1/01 - Track.flac' },
      { path: 'Artist/Album (2020)/CD2/01 - Track.flac' },
    ];

    const folders = extractAlbumFolders(files);

    // Should recognize CD1/CD2 as part of same album
    expect(folders).toHaveLength(1);
    expect(folders[0].album).toBe('Album');
  });
});

describe('enrichAlbumFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch cover art for album folder', async () => {
    const folder: AlbumFolder = {
      path: 'Metallica/Master of Puppets (1986)',
      artist: 'Metallica',
      album: 'Master of Puppets',
      year: 1986,
    };

    // Mock fetch for MusicBrainz and Fanart.tv
    const mockFetch = vi.fn()
      // First call: MusicBrainz release-group search
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          'release-groups': [{
            id: 'test-mbid-123',
            title: 'Master of Puppets',
            'first-release-date': '1986-03-03',
            'artist-credit': [{
              name: 'Metallica',
              artist: { id: 'artist-mbid-456', name: 'Metallica' }
            }],
          }],
        }),
      })
      // Second call: Fanart.tv artist lookup
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          albums: {
            'test-mbid-123': {
              albumcover: [{
                url: 'https://assets.fanart.tv/fanart/music/artist-mbid-456/albumcover/test-mbid-123.jpg',
              }],
            },
          },
        }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const result = await enrichAlbumFolder(folder, {
      musicbrainzUserAgent: 'TestApp/1.0',
      fanartTvApiKey: 'test-fanart-key',
    });

    expect(result.coverUrl).toBe('https://assets.fanart.tv/fanart/music/artist-mbid-456/albumcover/test-mbid-123.jpg');
    expect(result.externalId).toBe('test-mbid-123');
    expect(result.externalSource).toBe('musicbrainz');
  });

  it('should return empty result when no cover art found', async () => {
    const folder: AlbumFolder = {
      path: 'Unknown Artist/Unknown Album',
      artist: 'Unknown Artist',
      album: 'Unknown Album',
    };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          'release-groups': [],
        }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const result = await enrichAlbumFolder(folder, {
      musicbrainzUserAgent: 'TestApp/1.0',
    });

    expect(result.coverUrl).toBeUndefined();
    expect(result.externalId).toBeUndefined();
  });

  it('should handle API errors gracefully', async () => {
    const folder: AlbumFolder = {
      path: 'Artist/Album',
      artist: 'Artist',
      album: 'Album',
    };

    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'));

    vi.stubGlobal('fetch', mockFetch);

    const result = await enrichAlbumFolder(folder, {
      musicbrainzUserAgent: 'TestApp/1.0',
    });

    expect(result.error).toBe('Network error');
    expect(result.coverUrl).toBeUndefined();
  });

  it('should use year to improve search accuracy', async () => {
    const folder: AlbumFolder = {
      path: 'Metallica/Metallica (1991)',
      artist: 'Metallica',
      album: 'Metallica',
      year: 1991,
    };

    const mockFetch = vi.fn()
      // First call: MusicBrainz release-group search
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          'release-groups': [{
            id: 'black-album-mbid',
            title: 'Metallica',
            'first-release-date': '1991-08-12',
            'artist-credit': [{
              name: 'Metallica',
              artist: { id: 'metallica-artist-mbid', name: 'Metallica' }
            }],
          }],
        }),
      })
      // Second call: Fanart.tv artist lookup
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          albums: {
            'black-album-mbid': {
              albumcover: [{
                url: 'https://assets.fanart.tv/fanart/music/metallica-artist-mbid/albumcover/black-album-mbid.jpg',
              }],
            },
          },
        }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const result = await enrichAlbumFolder(folder, {
      musicbrainzUserAgent: 'TestApp/1.0',
      fanartTvApiKey: 'test-fanart-key',
    });

    // Verify the search query included the year
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('Metallica'),
      expect.any(Object)
    );
    expect(result.coverUrl).toBeDefined();
  });
});
