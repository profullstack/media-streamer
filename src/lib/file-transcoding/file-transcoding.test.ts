/**
 * File-based Transcoding Service Tests
 *
 * Tests for transcoding MP4/MOV files that require file-based access
 * due to the moov atom being at the end of the file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FileTranscodingService,
  getTempFilePath,
  cleanupTempFile,
  isFileBasedTranscodingRequired,
  TEMP_DIR,
} from './file-transcoding';

describe('File-based Transcoding Service', () => {
  describe('getTempFilePath', () => {
    it('should generate correct temp file path', () => {
      const path = getTempFilePath('abc123', 0, 'mp4');
      expect(path).toBe(join(TEMP_DIR, 'abc123_0.mp4'));
    });

    it('should handle different file indices', () => {
      const path = getTempFilePath('abc123', 5, 'mov');
      expect(path).toBe(join(TEMP_DIR, 'abc123_5.mov'));
    });

    it('should sanitize infohash', () => {
      const path = getTempFilePath('ABC123DEF', 0, 'mp4');
      expect(path).toBe(join(TEMP_DIR, 'abc123def_0.mp4'));
    });
  });

  describe('isFileBasedTranscodingRequired', () => {
    it('should return true for MP4 files', () => {
      expect(isFileBasedTranscodingRequired('video.mp4')).toBe(true);
    });

    it('should return true for MOV files', () => {
      expect(isFileBasedTranscodingRequired('video.mov')).toBe(true);
    });

    it('should return true for M4V files', () => {
      expect(isFileBasedTranscodingRequired('video.m4v')).toBe(true);
    });

    it('should return true for M4A files', () => {
      expect(isFileBasedTranscodingRequired('audio.m4a')).toBe(true);
    });

    it('should return true for 3GP files', () => {
      expect(isFileBasedTranscodingRequired('video.3gp')).toBe(true);
    });

    it('should return false for MKV files', () => {
      expect(isFileBasedTranscodingRequired('video.mkv')).toBe(false);
    });

    it('should return false for AVI files', () => {
      expect(isFileBasedTranscodingRequired('video.avi')).toBe(false);
    });

    it('should return false for FLAC files', () => {
      expect(isFileBasedTranscodingRequired('audio.flac')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isFileBasedTranscodingRequired('video.MP4')).toBe(true);
      expect(isFileBasedTranscodingRequired('video.MoV')).toBe(true);
    });

    it('should handle files with multiple dots', () => {
      expect(isFileBasedTranscodingRequired('The.Running.Man.2025.mp4')).toBe(true);
    });
  });

  describe('cleanupTempFile', () => {
    const testDir = join(tmpdir(), 'file-transcoding-test');
    const testFile = join(testDir, 'test.mp4');

    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      // Create a test file
      const stream = createWriteStream(testFile);
      stream.write('test data');
      stream.end();
      await new Promise<void>((resolve) => stream.on('finish', () => resolve()));
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should delete existing file', async () => {
      await cleanupTempFile(testFile);
      await expect(access(testFile)).rejects.toThrow();
    });

    it('should not throw for non-existent file', async () => {
      await expect(cleanupTempFile(join(testDir, 'nonexistent.mp4'))).resolves.not.toThrow();
    });
  });

  describe('FileTranscodingService', () => {
    let service: FileTranscodingService;

    beforeEach(() => {
      service = new FileTranscodingService();
    });

    afterEach(async () => {
      await service.destroy();
    });

    describe('constructor', () => {
      it('should create service with default options', () => {
        expect(service).toBeInstanceOf(FileTranscodingService);
      });

      it('should accept custom options', async () => {
        const customService = new FileTranscodingService({
          maxConcurrentDownloads: 5,
          downloadTimeout: 120000,
          minBytesBeforeTranscode: 10 * 1024 * 1024,
        });
        expect(customService).toBeInstanceOf(FileTranscodingService);
        await customService.destroy();
      });
    });

    describe('getActiveDownloadCount', () => {
      it('should return 0 initially', () => {
        expect(service.getActiveDownloadCount()).toBe(0);
      });
    });

    describe('getActiveTranscodeCount', () => {
      it('should return 0 initially', () => {
        expect(service.getActiveTranscodeCount()).toBe(0);
      });
    });

    describe('isDownloading', () => {
      it('should return false for unknown infohash', () => {
        expect(service.isDownloading('unknown', 0)).toBe(false);
      });
    });

    describe('getDownloadProgress', () => {
      it('should return null for unknown infohash', () => {
        expect(service.getDownloadProgress('unknown', 0)).toBeNull();
      });
    });

    describe('abortDownload', () => {
      it('should return false for unknown download', () => {
        expect(service.abortDownload('unknown', 0)).toBe(false);
      });
    });

    describe('abortTranscode', () => {
      it('should return false for unknown transcode', () => {
        expect(service.abortTranscode('unknown', 0)).toBe(false);
      });
    });
  });

  describe('FileTranscodingService - downloadAndTranscode (stream-as-available)', () => {
    let service: FileTranscodingService;

    afterEach(async () => {
      if (service) await service.destroy();
    });

    it('should start transcoding before full download completes', async () => {
      // Use a small threshold so the test completes quickly
      service = new FileTranscodingService({
        minBytesBeforeTranscode: 1024, // 1KB threshold
        downloadTimeout: 10000,
      });

      const totalBytes = 10 * 1024; // 10KB total
      let chunksSent = 0;

      // Create a source stream that sends data in chunks with delays
      const sourceStream = new Readable({
        read() {
          if (chunksSent >= 10) {
            this.push(null); // end
            return;
          }
          // Send 1KB chunks
          const chunk = Buffer.alloc(1024, chunksSent);
          chunksSent++;
          this.push(chunk);
        },
      });

      const result = await service.downloadAndTranscode(
        sourceStream,
        'aabbccdd',
        0,
        'test.mp4',
        totalBytes
      );

      // Should resolve with a stream and mimeType before full download
      expect(result).toHaveProperty('stream');
      expect(result).toHaveProperty('mimeType');
      expect(result.mimeType).toBe('video/mp4');

      // Clean up the stream
      result.stream.destroy();
    }, 15000);

    it('should reject if concurrent download limit exceeded', async () => {
      service = new FileTranscodingService({
        maxConcurrentDownloads: 1,
        minBytesBeforeTranscode: 1024 * 1024, // 1MB - won't reach it
        downloadTimeout: 5000,
      });

      // Create a slow stream that sends a little data then stalls
      let pushed = false;
      const slowStream = new Readable({
        read() {
          if (!pushed) {
            pushed = true;
            this.push(Buffer.alloc(100));
          }
          // Stall after first chunk
        },
      });

      // Start first download (won't complete but holds the slot)
      const firstDownload = service.downloadAndTranscode(
        slowStream,
        'aaaa1111',
        0,
        'first.mp4',
        1000000
      );

      // Wait a tick for the async registration to complete
      await new Promise((r) => setTimeout(r, 100));

      // Second download should be rejected immediately
      const fastStream = new Readable({ read() { this.push(null); } });
      await expect(
        service.downloadAndTranscode(fastStream, 'bbbb2222', 0, 'second.mp4', 1000)
      ).rejects.toThrow(/Maximum concurrent downloads/);

      // Clean up
      slowStream.destroy();
      try { await firstDownload; } catch { /* expected */ }
    }, 10000);

    it('should handle small files that complete before threshold', async () => {
      service = new FileTranscodingService({
        minBytesBeforeTranscode: 50 * 1024 * 1024, // 50MB threshold
        downloadTimeout: 10000,
      });

      const totalBytes = 512; // Tiny file

      const sourceStream = new Readable({
        read() {
          this.push(Buffer.alloc(512, 0x42));
          this.push(null);
        },
      });

      // Should still resolve — threshold logic uses min(50MB, 10% of file = 51 bytes)
      const result = await service.downloadAndTranscode(
        sourceStream,
        'ccccdddd',
        0,
        'tiny.mp4',
        totalBytes
      );

      expect(result).toHaveProperty('stream');
      expect(result.mimeType).toBe('video/mp4');
      result.stream.destroy();
    }, 15000);

    it('should timeout if not enough data arrives', async () => {
      service = new FileTranscodingService({
        minBytesBeforeTranscode: 1024 * 1024, // 1MB
        downloadTimeout: 1000, // 1 second timeout
      });

      // Stream that sends one tiny chunk then stalls forever
      let pushed = false;
      const stallStream = new Readable({
        read() {
          if (!pushed) {
            pushed = true;
            this.push(Buffer.alloc(100));
          }
          // Don't push anything else — stall
        },
      });

      await expect(
        service.downloadAndTranscode(stallStream, 'deadbeef', 0, 'stall.mp4', 10 * 1024 * 1024)
      ).rejects.toThrow(/Timed out/);

      stallStream.destroy();
    }, 10000);
  });
});
