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
        name: 'Big Buck Bunny',
        total_size: 276445467,
        file_count: 1,
        piece_length: 262144,
        created_by: null,
        status: 'ready',
        error_message: null,
        indexed_at: '2025-12-26T22:25:00.000Z',
        created_at: '2025-12-26T22:24:00.000Z',
        updated_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrent(dbTorrent);

      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        magnetUri: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        name: 'Big Buck Bunny',
        totalSize: 276445467,
        fileCount: 1,
        pieceLength: 262144,
        createdAt: '2025-12-26T22:24:00.000Z',
        updatedAt: '2025-12-26T22:25:00.000Z',
      });
    });

    it('should handle null piece_length', () => {
      const dbTorrent: DbTorrent = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        infohash: 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        magnet_uri: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c',
        name: 'Test Torrent',
        total_size: 1000,
        file_count: 1,
        piece_length: null,
        created_by: null,
        status: 'ready',
        error_message: null,
        indexed_at: null,
        created_at: '2025-12-26T22:24:00.000Z',
        updated_at: '2025-12-26T22:25:00.000Z',
      };

      const result = transformTorrent(dbTorrent);

      expect(result.pieceLength).toBe(0);
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
