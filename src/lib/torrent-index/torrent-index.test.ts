/**
 * Torrent Index Module Tests
 * 
 * Tests for magnet URL ingestion and torrent file indexing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseMagnetUri,
  validateMagnetUri,
  extractInfohash,
  detectMediaType,
  detectMimeType,
  getFileExtension,
  createTorrentRecord,
  createFileRecords,
  calculatePieceMapping,
  type TorrentRecord,
  type TorrentFileRecord,
  type ParsedMagnet,
} from './torrent-index';

describe('Torrent Index Module', () => {
  describe('parseMagnetUri', () => {
    it('should parse a valid magnet URI', () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=Test+Torrent&tr=udp://tracker.example.com:6969';
      const result = parseMagnetUri(magnet);

      expect(result.infohash).toBe('abc123def456789012345678901234567890abcd');
      expect(result.name).toBe('Test Torrent');
      expect(result.trackers).toContain('udp://tracker.example.com:6969');
    });

    it('should parse magnet URI with multiple trackers', () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&tr=udp://tracker1.com&tr=udp://tracker2.com';
      const result = parseMagnetUri(magnet);

      expect(result.trackers).toHaveLength(2);
      expect(result.trackers).toContain('udp://tracker1.com');
      expect(result.trackers).toContain('udp://tracker2.com');
    });

    it('should handle magnet URI without display name', () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      const result = parseMagnetUri(magnet);

      expect(result.infohash).toBe('abc123def456789012345678901234567890abcd');
      expect(result.name).toBe('abc123def456789012345678901234567890abcd');
    });

    it('should decode URL-encoded display name', () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=My%20Awesome%20Torrent%20%5B2024%5D';
      const result = parseMagnetUri(magnet);

      expect(result.name).toBe('My Awesome Torrent [2024]');
    });

    it('should handle uppercase infohash', () => {
      const magnet = 'magnet:?xt=urn:btih:ABC123DEF456789012345678901234567890ABCD';
      const result = parseMagnetUri(magnet);

      expect(result.infohash).toBe('abc123def456789012345678901234567890abcd');
    });

    it('should throw error for invalid magnet URI', () => {
      expect(() => parseMagnetUri('not-a-magnet')).toThrow('Invalid magnet URI');
    });

    it('should throw error for missing infohash', () => {
      expect(() => parseMagnetUri('magnet:?dn=Test')).toThrow('Invalid magnet URI');
    });
  });

  describe('validateMagnetUri', () => {
    it('should return true for valid magnet URI', () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      expect(validateMagnetUri(magnet)).toBe(true);
    });

    it('should return false for non-magnet URI', () => {
      expect(validateMagnetUri('https://example.com')).toBe(false);
      expect(validateMagnetUri('ftp://files.com/file.torrent')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateMagnetUri('')).toBe(false);
    });

    it('should return false for malformed magnet URI', () => {
      expect(validateMagnetUri('magnet:')).toBe(false);
      expect(validateMagnetUri('magnet:?')).toBe(false);
      expect(validateMagnetUri('magnet:?dn=Test')).toBe(false);
    });

    it('should return false for invalid infohash length', () => {
      expect(validateMagnetUri('magnet:?xt=urn:btih:abc123')).toBe(false);
      expect(validateMagnetUri('magnet:?xt=urn:btih:abc123def456789012345678901234567890abcdextra')).toBe(false);
    });
  });

  describe('extractInfohash', () => {
    it('should extract 40-character hex infohash', () => {
      const magnet = 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd';
      expect(extractInfohash(magnet)).toBe('abc123def456789012345678901234567890abcd');
    });

    it('should convert base32 infohash to hex', () => {
      // Valid 32-character base32 infohash (represents 20 bytes = 160 bits)
      // Using a known valid base32 infohash: YNCKHTQCWBTRNJIV4WNNE7SGXJICDBS6
      const magnet = 'magnet:?xt=urn:btih:YNCKHTQCWBTRNJIV4WNNE7SGXJICDBS6';
      const result = extractInfohash(magnet);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(40);
    });

    it('should return null for invalid magnet', () => {
      expect(extractInfohash('not-a-magnet')).toBeNull();
    });
  });

  describe('detectMediaType', () => {
    it('should detect audio files', () => {
      expect(detectMediaType('mp3')).toBe('audio');
      expect(detectMediaType('flac')).toBe('audio');
      expect(detectMediaType('wav')).toBe('audio');
      expect(detectMediaType('ogg')).toBe('audio');
      expect(detectMediaType('m4a')).toBe('audio');
      expect(detectMediaType('aac')).toBe('audio');
    });

    it('should detect video files', () => {
      expect(detectMediaType('mp4')).toBe('video');
      expect(detectMediaType('mkv')).toBe('video');
      expect(detectMediaType('avi')).toBe('video');
      expect(detectMediaType('mov')).toBe('video');
      expect(detectMediaType('webm')).toBe('video');
      expect(detectMediaType('m4v')).toBe('video');
    });

    it('should detect ebook files', () => {
      expect(detectMediaType('pdf')).toBe('ebook');
      expect(detectMediaType('epub')).toBe('ebook');
      expect(detectMediaType('mobi')).toBe('ebook');
      expect(detectMediaType('azw3')).toBe('ebook');
    });

    it('should detect image files', () => {
      expect(detectMediaType('jpg')).toBe('image');
      expect(detectMediaType('jpeg')).toBe('image');
      expect(detectMediaType('png')).toBe('image');
      expect(detectMediaType('gif')).toBe('image');
      expect(detectMediaType('webp')).toBe('image');
    });

    it('should detect archive files', () => {
      expect(detectMediaType('zip')).toBe('archive');
      expect(detectMediaType('rar')).toBe('archive');
      expect(detectMediaType('7z')).toBe('archive');
      expect(detectMediaType('tar')).toBe('archive');
    });

    it('should return other for unknown extensions', () => {
      expect(detectMediaType('xyz')).toBe('other');
      expect(detectMediaType('unknown')).toBe('other');
      expect(detectMediaType('')).toBe('other');
    });

    it('should be case-insensitive', () => {
      expect(detectMediaType('MP3')).toBe('audio');
      expect(detectMediaType('MKV')).toBe('video');
      expect(detectMediaType('PDF')).toBe('ebook');
    });
  });

  describe('detectMimeType', () => {
    it('should return correct MIME types for audio', () => {
      expect(detectMimeType('mp3')).toBe('audio/mpeg');
      expect(detectMimeType('flac')).toBe('audio/flac');
      expect(detectMimeType('wav')).toBe('audio/wav');
      expect(detectMimeType('ogg')).toBe('audio/ogg');
    });

    it('should return correct MIME types for video', () => {
      expect(detectMimeType('mp4')).toBe('video/mp4');
      expect(detectMimeType('mkv')).toBe('video/x-matroska');
      expect(detectMimeType('webm')).toBe('video/webm');
      expect(detectMimeType('avi')).toBe('video/x-msvideo');
    });

    it('should return correct MIME types for ebooks', () => {
      expect(detectMimeType('pdf')).toBe('application/pdf');
      expect(detectMimeType('epub')).toBe('application/epub+zip');
    });

    it('should return application/octet-stream for unknown', () => {
      expect(detectMimeType('xyz')).toBe('application/octet-stream');
    });
  });

  describe('getFileExtension', () => {
    it('should extract file extension', () => {
      expect(getFileExtension('song.mp3')).toBe('mp3');
      expect(getFileExtension('movie.mkv')).toBe('mkv');
      expect(getFileExtension('document.pdf')).toBe('pdf');
    });

    it('should handle multiple dots in filename', () => {
      expect(getFileExtension('file.name.with.dots.mp4')).toBe('mp4');
    });

    it('should handle paths', () => {
      expect(getFileExtension('/path/to/file.mp3')).toBe('mp3');
      expect(getFileExtension('folder/subfolder/video.mkv')).toBe('mkv');
    });

    it('should return empty string for no extension', () => {
      expect(getFileExtension('filename')).toBe('');
      expect(getFileExtension('README')).toBe('');
    });

    it('should handle hidden files', () => {
      expect(getFileExtension('.gitignore')).toBe('gitignore');
      expect(getFileExtension('.hidden.txt')).toBe('txt');
    });

    it('should be case-preserving', () => {
      expect(getFileExtension('file.MP3')).toBe('mp3');
      expect(getFileExtension('file.MKV')).toBe('mkv');
    });
  });

  describe('createTorrentRecord', () => {
    it('should create a torrent record from parsed magnet', () => {
      const parsed: ParsedMagnet = {
        infohash: 'abc123def456789012345678901234567890abcd',
        name: 'Test Torrent',
        trackers: ['udp://tracker.example.com:6969'],
        magnetUri: 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=Test+Torrent',
      };

      const record = createTorrentRecord(parsed, 'user-123');

      expect(record.infohash).toBe('abc123def456789012345678901234567890abcd');
      expect(record.name).toBe('Test Torrent');
      expect(record.magnet_uri).toBe(parsed.magnetUri);
      expect(record.created_by).toBe('user-123');
      expect(record.status).toBe('pending');
      expect(record.total_size).toBe(0);
      expect(record.file_count).toBe(0);
    });

    it('should handle null user ID', () => {
      const parsed: ParsedMagnet = {
        infohash: 'abc123def456789012345678901234567890abcd',
        name: 'Test',
        trackers: [],
        magnetUri: 'magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd',
      };

      const record = createTorrentRecord(parsed, null);
      expect(record.created_by).toBeNull();
    });
  });

  describe('createFileRecords', () => {
    it('should create file records from torrent files', () => {
      const torrentId = 'torrent-123';
      const files = [
        { path: 'Music/Artist/song.mp3', length: 5000000 },
        { path: 'Music/Artist/album.jpg', length: 500000 },
      ];
      const pieceLength = 262144;

      const records = createFileRecords(torrentId, files, pieceLength);

      expect(records).toHaveLength(2);
      
      expect(records[0].torrent_id).toBe(torrentId);
      expect(records[0].path).toBe('Music/Artist/song.mp3');
      expect(records[0].name).toBe('song.mp3');
      expect(records[0].size).toBe(5000000);
      expect(records[0].extension).toBe('mp3');
      expect(records[0].media_type).toBe('audio');
      expect(records[0].mime_type).toBe('audio/mpeg');
      expect(records[0].file_index).toBe(0);

      expect(records[1].file_index).toBe(1);
      expect(records[1].media_type).toBe('image');
    });

    it('should handle empty file list', () => {
      const records = createFileRecords('torrent-123', [], 262144);
      expect(records).toHaveLength(0);
    });

    it('should extract filename from path', () => {
      const files = [{ path: 'folder/subfolder/deep/file.mkv', length: 1000 }];
      const records = createFileRecords('torrent-123', files, 262144);

      expect(records[0].name).toBe('file.mkv');
    });
  });

  describe('calculatePieceMapping', () => {
    it('should calculate piece mapping for a file', () => {
      const pieceLength = 262144; // 256 KB
      const fileOffset = 0;
      const fileSize = 1000000; // ~1 MB

      const mapping = calculatePieceMapping(fileOffset, fileSize, pieceLength);

      expect(mapping.pieceStart).toBe(0);
      expect(mapping.pieceEnd).toBe(3); // ceil(1000000 / 262144) - 1 = 3
      expect(mapping.offsetInFirstPiece).toBe(0);
    });

    it('should handle file starting mid-piece', () => {
      const pieceLength = 262144;
      const fileOffset = 100000; // Starts 100KB into first piece
      const fileSize = 500000;

      const mapping = calculatePieceMapping(fileOffset, fileSize, pieceLength);

      expect(mapping.pieceStart).toBe(0);
      expect(mapping.offsetInFirstPiece).toBe(100000);
    });

    it('should handle file spanning multiple pieces', () => {
      const pieceLength = 262144;
      const fileOffset = 500000; // Starts in piece 1
      const fileSize = 1000000;

      const mapping = calculatePieceMapping(fileOffset, fileSize, pieceLength);

      expect(mapping.pieceStart).toBe(1); // floor(500000 / 262144) = 1
      expect(mapping.pieceEnd).toBe(5); // ceil((500000 + 1000000) / 262144) - 1 = 5
    });

    it('should handle small files within single piece', () => {
      const pieceLength = 262144;
      const fileOffset = 0;
      const fileSize = 1000; // 1 KB

      const mapping = calculatePieceMapping(fileOffset, fileSize, pieceLength);

      expect(mapping.pieceStart).toBe(0);
      expect(mapping.pieceEnd).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long torrent names', () => {
      const longName = 'A'.repeat(1000);
      const magnet = `magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=${encodeURIComponent(longName)}`;
      const result = parseMagnetUri(magnet);

      expect(result.name).toBe(longName);
    });

    it('should handle special characters in torrent name', () => {
      const specialName = 'Test [2024] (1080p) - Special & Edition!';
      const magnet = `magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=${encodeURIComponent(specialName)}`;
      const result = parseMagnetUri(magnet);

      expect(result.name).toBe(specialName);
    });

    it('should handle unicode in torrent name', () => {
      const unicodeName = '日本語トレント 🎵';
      const magnet = `magnet:?xt=urn:btih:abc123def456789012345678901234567890abcd&dn=${encodeURIComponent(unicodeName)}`;
      const result = parseMagnetUri(magnet);

      expect(result.name).toBe(unicodeName);
    });

    it('should handle zero-length files', () => {
      const files = [{ path: 'empty.txt', length: 0 }];
      const records = createFileRecords('torrent-123', files, 262144);

      expect(records[0].size).toBe(0);
    });

    it('should handle very large file sizes', () => {
      const files = [{ path: 'huge.mkv', length: 50_000_000_000 }]; // 50 GB
      const records = createFileRecords('torrent-123', files, 262144);

      expect(records[0].size).toBe(50_000_000_000);
    });
  });
});
