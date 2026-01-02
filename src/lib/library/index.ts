/**
 * Library Module
 *
 * Server-side library operations for favorites, collections, and history.
 */

export {
  // Repository
  LibraryRepository,
  getLibraryRepository,
  createLibraryRepository,
  // Types
  type CollectionType,
  type Favorite,
  type Collection,
  type CollectionItem,
  type WatchProgress,
  type ReadingProgress,
  type HistoryItem,
} from './repository';
