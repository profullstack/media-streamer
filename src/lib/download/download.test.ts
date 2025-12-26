/**
 * Download Module Tests
 * 
 * TDD tests for download feature (premium users only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDownloadRequest,
  validateDownloadRequest,
  canUserDownload,
  getDownloadUrl,
  formatDownloadFilename,
  sanitizeFilename,
  getContentDisposition,
  calculateDownloadSize,
  formatFileSize,
  estimateDownloadTime,
  createDownloadSession,
  getDownloadProgress,
  updateDownloadProgress,
  completeDownload,
  cancelDownload,
  getActiveDownloads,
  cleanupExpiredDownloads,
  DownloadRequest,
  DownloadSession,
  DownloadProgress,
  DownloadStatus,
} from './download';

describe('Download Module', () => {
  describe('Download Request Creation', () => {
    it('should create a download request', () => {
      const request = createDownloadRequest({
        userId: 'user-123',
        infohash: 'abc123def456',
        fileIndex: 0,
        filename: 'movie.mp4',
        fileSize: 1024 * 1024 * 100, // 100MB
      });

      expect(request.id).toBeDefined();
      expect(request.userId).toBe('user-123');
      expect(request.infohash).toBe('abc123def456');
      expect(request.fileIndex).toBe(0);
      expect(request.filename).toBe('movie.mp4');
      expect(request.fileSize).toBe(104857600);
      expect(request.createdAt).toBeInstanceOf(Date);
      expect(request.status).toBe('pending');
    });

    it('should create request for entire torrent', () => {
      const request = createDownloadRequest({
        userId: 'user-123',
        infohash: 'abc123def456',
        fileIndex: -1, // -1 means entire torrent
        filename: 'torrent-archive.zip',
        fileSize: 1024 * 1024 * 500,
      });

      expect(request.fileIndex).toBe(-1);
    });
  });

  describe('Download Request Validation', () => {
    it('should validate correct download request', () => {
      const request: DownloadRequest = {
        id: 'dl-123',
        userId: 'user-123',
        infohash: 'abc123def456',
        fileIndex: 0,
        filename: 'movie.mp4',
        fileSize: 104857600,
        createdAt: new Date(),
        status: 'pending',
      };

      expect(validateDownloadRequest(request)).toBe(true);
    });

    it('should reject request without user ID', () => {
      const request: DownloadRequest = {
        id: 'dl-123',
        userId: '',
        infohash: 'abc123def456',
        fileIndex: 0,
        filename: 'movie.mp4',
        fileSize: 104857600,
        createdAt: new Date(),
        status: 'pending',
      };

      expect(validateDownloadRequest(request)).toBe(false);
    });

    it('should reject request without infohash', () => {
      const request: DownloadRequest = {
        id: 'dl-123',
        userId: 'user-123',
        infohash: '',
        fileIndex: 0,
        filename: 'movie.mp4',
        fileSize: 104857600,
        createdAt: new Date(),
        status: 'pending',
      };

      expect(validateDownloadRequest(request)).toBe(false);
    });

    it('should reject request with invalid file index', () => {
      const request: DownloadRequest = {
        id: 'dl-123',
        userId: 'user-123',
        infohash: 'abc123def456',
        fileIndex: -2, // Invalid (only -1 for entire torrent is valid)
        filename: 'movie.mp4',
        fileSize: 104857600,
        createdAt: new Date(),
        status: 'pending',
      };

      expect(validateDownloadRequest(request)).toBe(false);
    });
  });

  describe('User Download Permission', () => {
    it('should allow premium users to download', () => {
      expect(canUserDownload('premium')).toBe(true);
    });

    it('should allow family users to download', () => {
      expect(canUserDownload('family')).toBe(true);
    });

    it('should deny free users from downloading', () => {
      expect(canUserDownload('free')).toBe(false);
    });
  });

  describe('Download URL Generation', () => {
    it('should generate download URL for file', () => {
      const url = getDownloadUrl({
        infohash: 'abc123def456',
        fileIndex: 0,
        token: 'session-token-123',
      });

      expect(url).toContain('/api/download');
      expect(url).toContain('infohash=abc123def456');
      expect(url).toContain('fileIndex=0');
      expect(url).toContain('token=session-token-123');
    });

    it('should generate download URL for entire torrent', () => {
      const url = getDownloadUrl({
        infohash: 'abc123def456',
        fileIndex: -1,
        token: 'session-token-123',
      });

      expect(url).toContain('fileIndex=-1');
    });
  });

  describe('Filename Handling', () => {
    it('should format download filename', () => {
      const filename = formatDownloadFilename('movie.mp4', 'abc123');
      expect(filename).toBe('movie.mp4');
    });

    it('should sanitize dangerous characters', () => {
      expect(sanitizeFilename('file/name.mp4')).toBe('file_name.mp4');
      expect(sanitizeFilename('file\\name.mp4')).toBe('file_name.mp4');
      expect(sanitizeFilename('file:name.mp4')).toBe('file_name.mp4');
      expect(sanitizeFilename('file*name.mp4')).toBe('file_name.mp4');
      expect(sanitizeFilename('file?name.mp4')).toBe('file_name.mp4');
      expect(sanitizeFilename('file"name.mp4')).toBe('file_name.mp4');
      expect(sanitizeFilename('file<name>.mp4')).toBe('file_name_.mp4');
      expect(sanitizeFilename('file|name.mp4')).toBe('file_name.mp4');
    });

    it('should handle empty filename', () => {
      expect(sanitizeFilename('')).toBe('download');
    });

    it('should trim whitespace', () => {
      expect(sanitizeFilename('  movie.mp4  ')).toBe('movie.mp4');
    });

    it('should handle unicode filenames', () => {
      expect(sanitizeFilename('日本語ファイル.mp4')).toBe('日本語ファイル.mp4');
    });
  });

  describe('Content-Disposition Header', () => {
    it('should generate content-disposition for attachment', () => {
      const header = getContentDisposition('movie.mp4', 'attachment');
      expect(header).toContain('attachment');
      expect(header).toContain('filename="movie.mp4"');
    });

    it('should generate content-disposition for inline', () => {
      const header = getContentDisposition('movie.mp4', 'inline');
      expect(header).toContain('inline');
    });

    it('should encode special characters in filename', () => {
      const header = getContentDisposition('movie (2024).mp4', 'attachment');
      expect(header).toContain("filename*=UTF-8''");
    });
  });

  describe('File Size Calculations', () => {
    it('should calculate total download size for single file', () => {
      const files = [
        { index: 0, size: 1024 * 1024 * 100 },
      ];
      const size = calculateDownloadSize(files, 0);
      expect(size).toBe(104857600);
    });

    it('should calculate total download size for entire torrent', () => {
      const files = [
        { index: 0, size: 1024 * 1024 * 100 },
        { index: 1, size: 1024 * 1024 * 50 },
        { index: 2, size: 1024 * 1024 * 25 },
      ];
      const size = calculateDownloadSize(files, -1);
      expect(size).toBe(183500800); // 175MB
    });

    it('should format file size in bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format file size in KB', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB');
      expect(formatFileSize(1536)).toBe('1.50 KB');
    });

    it('should format file size in MB', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
      expect(formatFileSize(1024 * 1024 * 5.5)).toBe('5.50 MB');
    });

    it('should format file size in GB', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
    });
  });

  describe('Download Time Estimation', () => {
    it('should estimate download time', () => {
      // 100MB at 10MB/s = 10 seconds
      const estimate = estimateDownloadTime(104857600, 10 * 1024 * 1024);
      expect(estimate.seconds).toBeCloseTo(10, 0);
    });

    it('should format time in seconds', () => {
      const estimate = estimateDownloadTime(1024 * 1024, 1024 * 1024);
      expect(estimate.formatted).toBe('1 second');
    });

    it('should format time in minutes', () => {
      const estimate = estimateDownloadTime(1024 * 1024 * 60, 1024 * 1024);
      expect(estimate.formatted).toBe('1 minute');
    });

    it('should handle zero speed', () => {
      const estimate = estimateDownloadTime(1024 * 1024, 0);
      expect(estimate.seconds).toBe(Infinity);
      expect(estimate.formatted).toBe('Unknown');
    });
  });

  describe('Download Session', () => {
    it('should create download session', () => {
      const session = createDownloadSession({
        userId: 'user-123',
        requestId: 'dl-123',
        totalSize: 104857600,
      });

      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-123');
      expect(session.requestId).toBe('dl-123');
      expect(session.totalSize).toBe(104857600);
      expect(session.downloadedSize).toBe(0);
      expect(session.status).toBe('active');
      expect(session.startedAt).toBeInstanceOf(Date);
    });

    it('should get download progress', () => {
      const session: DownloadSession = {
        id: 'session-123',
        userId: 'user-123',
        requestId: 'dl-123',
        totalSize: 104857600,
        downloadedSize: 52428800, // 50%
        status: 'active',
        startedAt: new Date(),
      };

      const progress = getDownloadProgress(session);

      expect(progress.percentage).toBe(50);
      expect(progress.downloadedSize).toBe(52428800);
      expect(progress.totalSize).toBe(104857600);
      expect(progress.remainingSize).toBe(52428800);
    });

    it('should update download progress', () => {
      const session: DownloadSession = {
        id: 'session-123',
        userId: 'user-123',
        requestId: 'dl-123',
        totalSize: 104857600,
        downloadedSize: 0,
        status: 'active',
        startedAt: new Date(),
      };

      const updated = updateDownloadProgress(session, 52428800);

      expect(updated.downloadedSize).toBe(52428800);
    });

    it('should complete download', () => {
      const session: DownloadSession = {
        id: 'session-123',
        userId: 'user-123',
        requestId: 'dl-123',
        totalSize: 104857600,
        downloadedSize: 104857600,
        status: 'active',
        startedAt: new Date(),
      };

      const completed = completeDownload(session);

      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeInstanceOf(Date);
    });

    it('should cancel download', () => {
      const session: DownloadSession = {
        id: 'session-123',
        userId: 'user-123',
        requestId: 'dl-123',
        totalSize: 104857600,
        downloadedSize: 52428800,
        status: 'active',
        startedAt: new Date(),
      };

      const cancelled = cancelDownload(session);

      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('Active Downloads Management', () => {
    it('should get active downloads for user', () => {
      const sessions: DownloadSession[] = [
        {
          id: 'session-1',
          userId: 'user-123',
          requestId: 'dl-1',
          totalSize: 100,
          downloadedSize: 50,
          status: 'active',
          startedAt: new Date(),
        },
        {
          id: 'session-2',
          userId: 'user-456',
          requestId: 'dl-2',
          totalSize: 100,
          downloadedSize: 50,
          status: 'active',
          startedAt: new Date(),
        },
        {
          id: 'session-3',
          userId: 'user-123',
          requestId: 'dl-3',
          totalSize: 100,
          downloadedSize: 100,
          status: 'completed',
          startedAt: new Date(),
        },
      ];

      const active = getActiveDownloads(sessions, 'user-123');

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('session-1');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup expired downloads', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const sessions: DownloadSession[] = [
        {
          id: 'session-1',
          userId: 'user-123',
          requestId: 'dl-1',
          totalSize: 100,
          downloadedSize: 50,
          status: 'active',
          startedAt: twoHoursAgo, // Expired
        },
        {
          id: 'session-2',
          userId: 'user-123',
          requestId: 'dl-2',
          totalSize: 100,
          downloadedSize: 50,
          status: 'active',
          startedAt: oneHourAgo, // Not expired
        },
      ];

      const cleaned = cleanupExpiredDownloads(sessions, 90 * 60 * 1000); // 90 min expiry

      expect(cleaned).toHaveLength(1);
      expect(cleaned[0].id).toBe('session-2');
    });
  });

  describe('Download Status', () => {
    it('should have correct status values', () => {
      const statuses: DownloadStatus[] = ['pending', 'active', 'completed', 'cancelled', 'failed'];
      
      statuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero file size', () => {
      const size = formatFileSize(0);
      expect(size).toBe('0 B');
    });

    it('should handle very large file sizes', () => {
      const size = formatFileSize(1024 * 1024 * 1024 * 1024); // 1TB
      expect(size).toBe('1024.00 GB');
    });

    it('should handle progress at 100%', () => {
      const session: DownloadSession = {
        id: 'session-123',
        userId: 'user-123',
        requestId: 'dl-123',
        totalSize: 100,
        downloadedSize: 100,
        status: 'active',
        startedAt: new Date(),
      };

      const progress = getDownloadProgress(session);
      expect(progress.percentage).toBe(100);
      expect(progress.remainingSize).toBe(0);
    });

    it('should handle progress over 100%', () => {
      const session: DownloadSession = {
        id: 'session-123',
        userId: 'user-123',
        requestId: 'dl-123',
        totalSize: 100,
        downloadedSize: 150, // More than total (edge case)
        status: 'active',
        startedAt: new Date(),
      };

      const progress = getDownloadProgress(session);
      expect(progress.percentage).toBe(100); // Capped at 100
    });
  });
});
