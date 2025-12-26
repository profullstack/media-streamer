/**
 * Progress Tracking Module Tests
 * 
 * TDD tests for watch progress and reading progress tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWatchProgress,
  updateWatchProgress,
  getWatchProgress,
  isWatched,
  getWatchPercentage,
  markAsWatched,
  resetWatchProgress,
  createReadingProgress,
  updateReadingProgress,
  getReadingProgress,
  isRead,
  getReadingPercentage,
  markAsRead,
  resetReadingProgress,
  getRecentlyWatched,
  getContinueWatching,
  getContinueReading,
  formatProgressTime,
  WatchProgress,
  ReadingProgress,
  ProgressType,
} from './progress';

describe('Progress Tracking Module', () => {
  describe('Watch Progress Creation', () => {
    it('should create watch progress', () => {
      const progress = createWatchProgress({
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200, // 2 hours in seconds
      });

      expect(progress.id).toBeDefined();
      expect(progress.userId).toBe('user-123');
      expect(progress.mediaId).toBe('media-456');
      expect(progress.mediaType).toBe('video');
      expect(progress.title).toBe('My Movie');
      expect(progress.duration).toBe(7200);
      expect(progress.currentTime).toBe(0);
      expect(progress.completed).toBe(false);
      expect(progress.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('Watch Progress Updates', () => {
    it('should update watch progress', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200,
        currentTime: 0,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updated = updateWatchProgress(progress, 3600); // 1 hour

      expect(updated.currentTime).toBe(3600);
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });

    it('should mark as completed when near end', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200,
        currentTime: 0,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 95% watched
      const updated = updateWatchProgress(progress, 6840);

      expect(updated.completed).toBe(true);
    });
  });

  describe('Watch Progress Queries', () => {
    it('should get watch progress', () => {
      const progressList: WatchProgress[] = [
        {
          id: 'prog-1',
          userId: 'user-123',
          mediaId: 'media-1',
          mediaType: 'video',
          title: 'Movie 1',
          duration: 7200,
          currentTime: 3600,
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'prog-2',
          userId: 'user-123',
          mediaId: 'media-2',
          mediaType: 'video',
          title: 'Movie 2',
          duration: 5400,
          currentTime: 5400,
          completed: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const progress = getWatchProgress(progressList, 'media-1');

      expect(progress).toBeDefined();
      expect(progress?.mediaId).toBe('media-1');
    });

    it('should return null for non-existent progress', () => {
      const progressList: WatchProgress[] = [];
      const progress = getWatchProgress(progressList, 'media-999');

      expect(progress).toBeNull();
    });
  });

  describe('Watch Status', () => {
    it('should check if media is watched', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200,
        currentTime: 7200,
        completed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(isWatched(progress)).toBe(true);
    });

    it('should return false for incomplete watch', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200,
        currentTime: 3600,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(isWatched(progress)).toBe(false);
    });
  });

  describe('Watch Percentage', () => {
    it('should calculate watch percentage', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200,
        currentTime: 3600,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(getWatchPercentage(progress)).toBe(50);
    });

    it('should handle zero duration', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 0,
        currentTime: 0,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(getWatchPercentage(progress)).toBe(0);
    });
  });

  describe('Mark as Watched', () => {
    it('should mark progress as watched', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200,
        currentTime: 3600,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const marked = markAsWatched(progress);

      expect(marked.completed).toBe(true);
      expect(marked.currentTime).toBe(7200);
    });
  });

  describe('Reset Watch Progress', () => {
    it('should reset watch progress', () => {
      const progress: WatchProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'media-456',
        mediaType: 'video',
        title: 'My Movie',
        duration: 7200,
        currentTime: 3600,
        completed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const reset = resetWatchProgress(progress);

      expect(reset.currentTime).toBe(0);
      expect(reset.completed).toBe(false);
    });
  });

  describe('Reading Progress Creation', () => {
    it('should create reading progress', () => {
      const progress = createReadingProgress({
        userId: 'user-123',
        mediaId: 'book-456',
        title: 'My Book',
        totalPages: 300,
      });

      expect(progress.id).toBeDefined();
      expect(progress.userId).toBe('user-123');
      expect(progress.mediaId).toBe('book-456');
      expect(progress.title).toBe('My Book');
      expect(progress.totalPages).toBe(300);
      expect(progress.currentPage).toBe(1);
      expect(progress.completed).toBe(false);
    });
  });

  describe('Reading Progress Updates', () => {
    it('should update reading progress', () => {
      const progress: ReadingProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'book-456',
        title: 'My Book',
        totalPages: 300,
        currentPage: 1,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updated = updateReadingProgress(progress, 150);

      expect(updated.currentPage).toBe(150);
    });

    it('should mark as completed on last page', () => {
      const progress: ReadingProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'book-456',
        title: 'My Book',
        totalPages: 300,
        currentPage: 1,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updated = updateReadingProgress(progress, 300);

      expect(updated.completed).toBe(true);
    });
  });

  describe('Reading Progress Queries', () => {
    it('should get reading progress', () => {
      const progressList: ReadingProgress[] = [
        {
          id: 'prog-1',
          userId: 'user-123',
          mediaId: 'book-1',
          title: 'Book 1',
          totalPages: 300,
          currentPage: 150,
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const progress = getReadingProgress(progressList, 'book-1');

      expect(progress).toBeDefined();
      expect(progress?.mediaId).toBe('book-1');
    });
  });

  describe('Reading Status', () => {
    it('should check if book is read', () => {
      const progress: ReadingProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'book-456',
        title: 'My Book',
        totalPages: 300,
        currentPage: 300,
        completed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(isRead(progress)).toBe(true);
    });
  });

  describe('Reading Percentage', () => {
    it('should calculate reading percentage', () => {
      const progress: ReadingProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'book-456',
        title: 'My Book',
        totalPages: 300,
        currentPage: 150,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(getReadingPercentage(progress)).toBe(50);
    });
  });

  describe('Mark as Read', () => {
    it('should mark progress as read', () => {
      const progress: ReadingProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'book-456',
        title: 'My Book',
        totalPages: 300,
        currentPage: 150,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const marked = markAsRead(progress);

      expect(marked.completed).toBe(true);
      expect(marked.currentPage).toBe(300);
    });
  });

  describe('Reset Reading Progress', () => {
    it('should reset reading progress', () => {
      const progress: ReadingProgress = {
        id: 'prog-123',
        userId: 'user-123',
        mediaId: 'book-456',
        title: 'My Book',
        totalPages: 300,
        currentPage: 150,
        completed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const reset = resetReadingProgress(progress);

      expect(reset.currentPage).toBe(1);
      expect(reset.completed).toBe(false);
    });
  });

  describe('Recently Watched', () => {
    it('should get recently watched items', () => {
      const now = new Date();
      const progressList: WatchProgress[] = [
        {
          id: 'prog-1',
          userId: 'user-123',
          mediaId: 'media-1',
          mediaType: 'video',
          title: 'Movie 1',
          duration: 7200,
          currentTime: 7200,
          completed: true,
          createdAt: new Date(now.getTime() - 1000),
          updatedAt: new Date(now.getTime() - 1000),
        },
        {
          id: 'prog-2',
          userId: 'user-123',
          mediaId: 'media-2',
          mediaType: 'video',
          title: 'Movie 2',
          duration: 5400,
          currentTime: 5400,
          completed: true,
          createdAt: new Date(now.getTime() - 2000),
          updatedAt: new Date(now.getTime() - 2000),
        },
      ];

      const recent = getRecentlyWatched(progressList, 10);

      expect(recent).toHaveLength(2);
      expect(recent[0].mediaId).toBe('media-1'); // Most recent first
    });
  });

  describe('Continue Watching', () => {
    it('should get items to continue watching', () => {
      const progressList: WatchProgress[] = [
        {
          id: 'prog-1',
          userId: 'user-123',
          mediaId: 'media-1',
          mediaType: 'video',
          title: 'Movie 1',
          duration: 7200,
          currentTime: 3600, // 50% watched
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'prog-2',
          userId: 'user-123',
          mediaId: 'media-2',
          mediaType: 'video',
          title: 'Movie 2',
          duration: 5400,
          currentTime: 5400,
          completed: true, // Completed
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const continueWatching = getContinueWatching(progressList);

      expect(continueWatching).toHaveLength(1);
      expect(continueWatching[0].mediaId).toBe('media-1');
    });
  });

  describe('Continue Reading', () => {
    it('should get items to continue reading', () => {
      const progressList: ReadingProgress[] = [
        {
          id: 'prog-1',
          userId: 'user-123',
          mediaId: 'book-1',
          title: 'Book 1',
          totalPages: 300,
          currentPage: 150, // 50% read
          completed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'prog-2',
          userId: 'user-123',
          mediaId: 'book-2',
          title: 'Book 2',
          totalPages: 200,
          currentPage: 200,
          completed: true, // Completed
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const continueReading = getContinueReading(progressList);

      expect(continueReading).toHaveLength(1);
      expect(continueReading[0].mediaId).toBe('book-1');
    });
  });

  describe('Progress Time Formatting', () => {
    it('should format seconds to time string', () => {
      expect(formatProgressTime(0)).toBe('0:00');
      expect(formatProgressTime(65)).toBe('1:05');
      expect(formatProgressTime(3600)).toBe('1:00:00');
      expect(formatProgressTime(3665)).toBe('1:01:05');
    });
  });

  describe('Progress Types', () => {
    it('should have correct progress type values', () => {
      const types: ProgressType[] = ['watch', 'read'];
      
      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });
});
