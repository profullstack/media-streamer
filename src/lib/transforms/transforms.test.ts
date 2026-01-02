/**
 * Data transformation tests
 * 
 * Tests for converting between Supabase snake_case and frontend camelCase formats.
 */

import { describe, it, expect } from 'vitest';
import {
  transformTorrent,
  transformTorrentFile,
  transformTorrentFiles,
} from './transforms';
import type { Torrent as DbTorrent, TorrentFile as DbTorrentFile } from '@/lib/supabase/types';

describe('transforms', () => {
  describe('transformTorrent', () => {
    it('should transform snake_case torrent to camelCase', () => {
      const dbTorrent: DbTorrent = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        magnet_uri: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        clean_title: null,
        name: 'Big Buck Bunny',
        total_size: 276445467,
        file_count: 1,
        piece_length: 262144,
        seeders: 42,
        leechers: 15,
        swarm_updated_at: '2025-12-26T22:30:00.000Z',
        created_by: null,
        status: 'ready',
        error_message: null,
        indexed_at: '2025-12-26T22:25:00.000Z',
        // External metadata fields
        poster_url: null,
        cover_url: null,
        content_type: null,
        external_id: null,
        external_source: null,
        year: null,
        description: null,
        // Credits fields
        director: null,
        actors: null,
        genre: null,
        metadata_fetched_at: null,
        // Codec fields
        video_codec: null,
        audio_codec: null,
        container: null,
        needs_transcoding: false,
        codec_detected_at: null,
        created_at: '2025-12-26T22:24:00.000Z',
        updated_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrent(dbTorrent);

      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        magnetUri: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        name: 'Big Buck Bunny',
        cleanTitle: null,
        totalSize: 276445467,
        fileCount: 1,
        pieceLength: 262144,
        seeders: 42,
        leechers: 15,
        swarmUpdatedAt: '2025-12-26T22:30:00.000Z',
        posterUrl: null,
        coverUrl: null,
        contentType: null,
        year: null,
        description: null,
        // Credits fields
        director: null,
        actors: null,
        genre: null,
        // Codec fields
        videoCodec: null,
        audioCodec: null,
        container: null,
        needsTranscoding: false,
        codecDetectedAt: null,
        createdAt: '2025-12-26T22:24:00.000Z',
        updatedAt: '2025-12-26T22:25:00.000Z',
      });
    });

    it('should handle null piece_length and swarm stats', () => {
      const dbTorrent: DbTorrent = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        magnet_uri: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        clean_title: null,
        name: 'Test Torrent',
        total_size: 1000,
        file_count: 1,
        piece_length: null,
        seeders: null,
        leechers: null,
        swarm_updated_at: null,
        created_by: null,
        status: 'ready',
        error_message: null,
        indexed_at: null,
        // External metadata fields
        poster_url: null,
        cover_url: null,
        content_type: null,
        external_id: null,
        external_source: null,
        year: null,
        description: null,
        // Credits fields
        director: null,
        actors: null,
        genre: null,
        metadata_fetched_at: null,
        // Codec fields
        video_codec: null,
        audio_codec: null,
        container: null,
        needs_transcoding: false,
        codec_detected_at: null,
        created_at: '2025-12-26T22:24:00.000Z',
        updated_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrent(dbTorrent);

      expect(result.pieceLength).toBe(0);
      expect(result.seeders).toBeNull();
      expect(result.leechers).toBeNull();
      expect(result.swarmUpdatedAt).toBeNull();
    });

    it('should transform metadata fields when present', () => {
      const dbTorrent: DbTorrent = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        magnet_uri: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        clean_title: null,
        name: 'Pink Floyd - Discography [FLAC]',
        total_size: 5000000000,
        file_count: 150,
        piece_length: 262144,
        seeders: 100,
        leechers: 20,
        swarm_updated_at: '2025-12-26T22:30:00.000Z',
        created_by: null,
        status: 'ready',
        error_message: null,
        indexed_at: '2025-12-26T22:25:00.000Z',
        // External metadata fields - populated
        poster_url: 'https://example.com/poster.jpg',
        cover_url: 'https://coverartarchive.org/release-group/abc123/front-500.jpg',
        content_type: 'music',
        external_id: 'abc123',
        external_source: 'musicbrainz',
        year: 1973,
        description: 'Complete discography of Pink Floyd',
        // Credits fields
        director: null,
        actors: null,
        genre: null,
        metadata_fetched_at: '2025-12-26T23:00:00.000Z',
        // Codec fields
        video_codec: null,
        audio_codec: 'flac',
        container: 'flac',
        needs_transcoding: false,
        codec_detected_at: '2025-12-26T23:00:00.000Z',
        created_at: '2025-12-26T22:24:00.000Z',
        updated_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrent(dbTorrent);

      expect(result.posterUrl).toBe('https://example.com/poster.jpg');
      expect(result.coverUrl).toBe('https://coverartarchive.org/release-group/abc123/front-500.jpg');
      expect(result.contentType).toBe('music');
      expect(result.year).toBe(1973);
      expect(result.description).toBe('Complete discography of Pink Floyd');
    });
  });

  describe('transformTorrentFile', () => {
    it('should transform snake_case file to camelCase', () => {
      const dbFile: DbTorrentFile = {
        id: '456e7890-e89b-12d3-a456-426614174001',
        torrent_id: '123e4567-e89b-12d3-a456-426614174000',
        file_index: 0,
        path: 'Big Buck Bunny/big_buck_bunny.mp4',
        name: 'big_buck_bunny.mp4',
        extension: 'mp4',
        size: 276445467,
        piece_start: 0,
        piece_end: 1054,
        media_category: 'video',
        mime_type: 'video/mp4',
        search_vector: null,
        created_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrentFile(dbFile);

      expect(result).toEqual({
        id: '456e7890-e89b-12d3-a456-426614174001',
        torrentId: '123e4567-e89b-12d3-a456-426614174000',
        fileIndex: 0,
        path: 'Big Buck Bunny/big_buck_bunny.mp4',
        name: 'big_buck_bunny.mp4',
        extension: 'mp4',
        size: 276445467,
        pieceStart: 0,
        pieceEnd: 1054,
        mediaCategory: 'video',
        mimeType: 'video/mp4',
        createdAt: '2025-12-26T22:25:00.000Z',
      });
    });

    it('should handle null extension', () => {
      const dbFile: DbTorrentFile = {
        id: '456e7890-e89b-12d3-a456-426614174001',
        torrent_id: '123e4567-e89b-12d3-a456-426614174000',
        file_index: 0,
        path: 'README',
        name: 'README',
        extension: null,
        size: 1000,
        piece_start: 0,
        piece_end: 1,
        media_category: 'other',
        mime_type: null,
        search_vector: null,
        created_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrentFile(dbFile);

      expect(result.extension).toBe('');
      expect(result.mimeType).toBe('application/octet-stream');
    });

    it('should handle null media_category', () => {
      const dbFile: DbTorrentFile = {
        id: '456e7890-e89b-12d3-a456-426614174001',
        torrent_id: '123e4567-e89b-12d3-a456-426614174000',
        file_index: 0,
        path: 'unknown.xyz',
        name: 'unknown.xyz',
        extension: 'xyz',
        size: 1000,
        piece_start: 0,
        piece_end: 1,
        media_category: null,
        mime_type: null,
        search_vector: null,
        created_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrentFile(dbFile);

      expect(result.mediaCategory).toBe('other');
    });
  });

  describe('transformTorrentFiles', () => {
    it('should transform array of files', () => {
      const dbFiles: DbTorrentFile[] = [
        {
          id: '456e7890-e89b-12d3-a456-426614174001',
          torrent_id: '123e4567-e89b-12d3-a456-426614174000',
          file_index: 0,
          path: 'file1.mp4',
          name: 'file1.mp4',
          extension: 'mp4',
          size: 1000,
          piece_start: 0,
          piece_end: 1,
          media_category: 'video',
          mime_type: 'video/mp4',
          search_vector: null,
          created_at: '2025-12-26T22:25:00.000Z',
        },
        {
          id: '456e7890-e89b-12d3-a456-426614174002',
          torrent_id: '123e4567-e89b-12d3-a456-426614174000',
          file_index: 1,
          path: 'file2.mp3',
          name: 'file2.mp3',
          extension: 'mp3',
          size: 2000,
          piece_start: 1,
          piece_end: 2,
          media_category: 'audio',
          mime_type: 'audio/mpeg',
          search_vector: null,
          created_at: '2025-12-26T22:25:00.000Z',
        },
      ];

      const result = transformTorrentFiles(dbFiles);

      expect(result).toHaveLength(2);
      expect(result[0].fileIndex).toBe(0);
      expect(result[1].fileIndex).toBe(1);
    });

    it('should return empty array for empty input', () => {
      const result = transformTorrentFiles([]);
      expect(result).toEqual([]);
    });
  });
});
