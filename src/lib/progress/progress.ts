/**
 * Progress Tracking Module
 * 
 * Handles watch progress and reading progress tracking
 */

import { randomUUID } from 'crypto';

// Types
export type ProgressType = 'watch' | 'read';
export type MediaType = 'video' | 'audio' | 'iptv';

export interface WatchProgress {
  id: string;
  userId: string;
  mediaId: string;
  mediaType: MediaType;
  title: string;
  duration: number; // in seconds
  currentTime: number; // in seconds
  completed: boolean;
  thumbnail?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReadingProgress {
  id: string;
  userId: string;
  mediaId: string;
  title: string;
  totalPages: number;
  currentPage: number;
  completed: boolean;
  thumbnail?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWatchProgressOptions {
  userId: string;
  mediaId: string;
  mediaType: MediaType;
  title: string;
  duration: number;
  thumbnail?: string;
}

export interface CreateReadingProgressOptions {
  userId: string;
  mediaId: string;
  title: string;
  totalPages: number;
  thumbnail?: string;
}

// Constants
const COMPLETION_THRESHOLD = 0.95; // 95% watched = completed

/**
 * Create watch progress for a media item
 */
export function createWatchProgress(options: CreateWatchProgressOptions): WatchProgress {
  const now = new Date();
  
  return {
    id: randomUUID(),
    userId: options.userId,
    mediaId: options.mediaId,
    mediaType: options.mediaType,
    title: options.title,
    duration: options.duration,
    currentTime: 0,
    completed: false,
    thumbnail: options.thumbnail,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update watch progress with new current time
 */
export function updateWatchProgress(progress: WatchProgress, currentTime: number): WatchProgress {
  const completed = progress.duration > 0 && currentTime / progress.duration >= COMPLETION_THRESHOLD;
  
  return {
    ...progress,
    currentTime,
    completed,
    updatedAt: new Date(),
  };
}

/**
 * Get watch progress for a specific media item
 */
export function getWatchProgress(progressList: WatchProgress[], mediaId: string): WatchProgress | null {
  return progressList.find(p => p.mediaId === mediaId) ?? null;
}

/**
 * Check if media is watched (completed)
 */
export function isWatched(progress: WatchProgress): boolean {
  return progress.completed;
}

/**
 * Get watch percentage
 */
export function getWatchPercentage(progress: WatchProgress): number {
  if (progress.duration === 0) {
    return 0;
  }
  return Math.round((progress.currentTime / progress.duration) * 100);
}

/**
 * Mark progress as watched
 */
export function markAsWatched(progress: WatchProgress): WatchProgress {
  return {
    ...progress,
    currentTime: progress.duration,
    completed: true,
    updatedAt: new Date(),
  };
}

/**
 * Reset watch progress
 */
export function resetWatchProgress(progress: WatchProgress): WatchProgress {
  return {
    ...progress,
    currentTime: 0,
    completed: false,
    updatedAt: new Date(),
  };
}

/**
 * Create reading progress for a book
 */
export function createReadingProgress(options: CreateReadingProgressOptions): ReadingProgress {
  const now = new Date();
  
  return {
    id: randomUUID(),
    userId: options.userId,
    mediaId: options.mediaId,
    title: options.title,
    totalPages: options.totalPages,
    currentPage: 1,
    completed: false,
    thumbnail: options.thumbnail,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update reading progress with new current page
 */
export function updateReadingProgress(progress: ReadingProgress, currentPage: number): ReadingProgress {
  const completed = currentPage >= progress.totalPages;
  
  return {
    ...progress,
    currentPage,
    completed,
    updatedAt: new Date(),
  };
}

/**
 * Get reading progress for a specific book
 */
export function getReadingProgress(progressList: ReadingProgress[], mediaId: string): ReadingProgress | null {
  return progressList.find(p => p.mediaId === mediaId) ?? null;
}

/**
 * Check if book is read (completed)
 */
export function isRead(progress: ReadingProgress): boolean {
  return progress.completed;
}

/**
 * Get reading percentage
 */
export function getReadingPercentage(progress: ReadingProgress): number {
  if (progress.totalPages === 0) {
    return 0;
  }
  return Math.round((progress.currentPage / progress.totalPages) * 100);
}

/**
 * Mark progress as read
 */
export function markAsRead(progress: ReadingProgress): ReadingProgress {
  return {
    ...progress,
    currentPage: progress.totalPages,
    completed: true,
    updatedAt: new Date(),
  };
}

/**
 * Reset reading progress
 */
export function resetReadingProgress(progress: ReadingProgress): ReadingProgress {
  return {
    ...progress,
    currentPage: 1,
    completed: false,
    updatedAt: new Date(),
  };
}

/**
 * Get recently watched items sorted by most recent
 */
export function getRecentlyWatched(progressList: WatchProgress[], limit: number): WatchProgress[] {
  return [...progressList]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
}

/**
 * Get items to continue watching (started but not completed)
 */
export function getContinueWatching(progressList: WatchProgress[]): WatchProgress[] {
  return progressList
    .filter(p => !p.completed && p.currentTime > 0)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Get items to continue reading (started but not completed)
 */
export function getContinueReading(progressList: ReadingProgress[]): ReadingProgress[] {
  return progressList
    .filter(p => !p.completed && p.currentPage > 1)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Format seconds to time string (e.g., "1:23:45" or "23:45")
 */
export function formatProgressTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
