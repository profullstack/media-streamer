/**
 * File-based Transcoding Service Tests
 *
 * Tests for transcoding MP4/MOV files that require file-based access
 * due to the moov atom being at the end of the file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWriteStream } from 'node:fs';
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

      it('should accept custom options', () => {
        const customService = new FileTranscodingService({
          maxConcurrentDownloads: 5,
          downloadTimeout: 120000,
        });
        expect(customService).toBeInstanceOf(FileTranscodingService);
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
  });
});
