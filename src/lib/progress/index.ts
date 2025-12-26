/**
 * Progress Tracking Module
 * 
 * Public API for watch progress and reading progress tracking
 */

export {
  // Types
  type ProgressType,
  type MediaType,
  type WatchProgress,
  type ReadingProgress,
  type CreateWatchProgressOptions,
  type CreateReadingProgressOptions,
  
  // Watch Progress Functions
  createWatchProgress,
  updateWatchProgress,
  getWatchProgress,
  isWatched,
  getWatchPercentage,
  markAsWatched,
  resetWatchProgress,
  
  // Reading Progress Functions
  createReadingProgress,
  updateReadingProgress,
  getReadingProgress,
  isRead,
  getReadingPercentage,
  markAsRead,
  resetReadingProgress,
  
  // Query Functions
  getRecentlyWatched,
  getContinueWatching,
  getContinueReading,
  
  // Utilities
  formatProgressTime,
} from './progress';
