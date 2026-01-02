/**
 * Library Repository Tests
 *
 * Tests for user library operations: favorites, collections, and watch/read history
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import {
  LibraryRepository,
  type Favorite,
  type Collection,
  type CollectionItem,
  type WatchProgress,
  type ReadingProgress,
} from './repository';

// Mock Supabase client
function createMockSupabaseClient() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockIn = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();
  const mockSingle = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockUpsert = vi.fn();

  // Store for pending results that should be returned when awaited
  let pendingResult: { data: unknown; error: unknown } | null = null;

  // Create a thenable chainable mock - it's both chainable AND awaitable
  const createThenableChainable = (): Record<string, unknown> => {
    const chainable: Record<string, unknown> = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      eq: mockEq,
      in: mockIn,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
      upsert: mockUpsert,
      // Make it thenable so it can be awaited
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
        if (pendingResult) {
          const result = pendingResult;
          pendingResult = null;
          resolve(result);
        } else {
          resolve({ data: null, error: null });
        }
        return Promise.resolve();
      },
    };
    return chainable;
  };

  // Helper to set the pending result for the next await
  const setPendingResult = (result: { data: unknown; error: unknown }) => {
    pendingResult = result;
  };

  // Make all methods chainable by returning the thenable chainable object
  mockSelect.mockImplementation(() => createThenableChainable());
  mockInsert.mockImplementation(() => createThenableChainable());
  mockUpdate.mockImplementation(() => createThenableChainable());
  mockDelete.mockImplementation(() => createThenableChainable());
  mockEq.mockImplementation(() => createThenableChainable());
  mockIn.mockImplementation(() => createThenableChainable());
  mockOrder.mockImplementation(() => createThenableChainable());
  mockLimit.mockImplementation(() => createThenableChainable());
  mockUpsert.mockImplementation(() => createThenableChainable());
  mockSingle.mockImplementation(() => createThenableChainable());
  mockMaybeSingle.mockImplementation(() => createThenableChainable());

  const mockFrom = vi.fn().mockImplementation(() => createThenableChainable());

  return {
    client: { from: mockFrom } as unknown as SupabaseClient<Database>,
    mocks: {
      from: mockFrom,
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      upsert: mockUpsert,
      eq: mockEq,
      in: mockIn,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    },
    // Helper to set the result for the next await
    setPendingResult,
  };
}

describe('LibraryRepository', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let repository: LibraryRepository;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    repository = new LibraryRepository(mockClient.client);
  });

  describe('Favorites', () => {
    const userId = 'user-123';
    const fileId = 'file-456';

    describe('getUserFavorites', () => {
      it('returns user favorites with file details', async () => {
        const mockFavorites = [
          {
            id: 'fav-1',
            user_id: userId,
            file_id: fileId,
            created_at: '2024-01-15T00:00:00Z',
            torrent_files: {
              id: fileId,
              name: 'Test File.mp3',
              path: '/music/Test File.mp3',
              size: 5000000,
              media_category: 'audio',
              torrent_id: 'torrent-1',
              torrents: {
                id: 'torrent-1',
                name: 'Test Album',
                infohash: 'abc123',
              },
            },
          },
        ];

        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockFavorites,
          error: null,
        });

        const result = await repository.getUserFavorites(userId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('user_favorites');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('fav-1');
        expect(result[0].file_id).toBe(fileId);
      });

      it('returns empty array when user has no favorites', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: [],
          error: null,
        });

        const result = await repository.getUserFavorites(userId);

        expect(result).toEqual([]);
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(repository.getUserFavorites(userId)).rejects.toThrow(
          'Failed to fetch favorites'
        );
      });
    });

    describe('addFavorite', () => {
      it('adds a file to favorites', async () => {
        const mockFavorite = {
          id: 'fav-new',
          user_id: userId,
          file_id: fileId,
          created_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockFavorite,
          error: null,
        });

        const result = await repository.addFavorite(userId, fileId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('user_favorites');
        expect(mockClient.mocks.insert).toHaveBeenCalledWith({
          user_id: userId,
          file_id: fileId,
        });
        expect(result.id).toBe('fav-new');
      });

      it('throws error when file already favorited', async () => {
        mockClient.mocks.single.mockResolvedValueOnce({
          data: null,
          error: { message: 'duplicate key', code: '23505' },
        });

        await expect(repository.addFavorite(userId, fileId)).rejects.toThrow(
          'File already in favorites'
        );
      });
    });

    describe('removeFavorite', () => {
      it('removes a file from favorites', async () => {
        mockClient.setPendingResult({
          data: null,
          error: null,
        });

        await repository.removeFavorite(userId, fileId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('user_favorites');
        expect(mockClient.mocks.delete).toHaveBeenCalled();
      });

      it('throws error on database failure', async () => {
        mockClient.setPendingResult({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(repository.removeFavorite(userId, fileId)).rejects.toThrow(
          'Failed to remove favorite'
        );
      });
    });

    describe('isFavorite', () => {
      it('returns true when file is favorited', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: { id: 'fav-1' },
          error: null,
        });

        const result = await repository.isFavorite(userId, fileId);

        expect(result).toBe(true);
      });

      it('returns false when file is not favorited', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: null,
          error: null,
        });

        const result = await repository.isFavorite(userId, fileId);

        expect(result).toBe(false);
      });
    });
  });

  describe('Collections', () => {
    const userId = 'user-123';
    const collectionId = 'col-456';

    describe('getUserCollections', () => {
      it('returns user collections with item counts', async () => {
        const mockCollections = [
          {
            id: collectionId,
            user_id: userId,
            name: 'My Playlist',
            collection_type: 'playlist',
            created_at: '2024-01-15T00:00:00Z',
            updated_at: '2024-01-15T00:00:00Z',
            collection_items: [{ count: 5 }],
          },
        ];

        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockCollections,
          error: null,
        });

        const result = await repository.getUserCollections(userId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('collections');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('My Playlist');
      });

      it('returns empty array when user has no collections', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: [],
          error: null,
        });

        const result = await repository.getUserCollections(userId);

        expect(result).toEqual([]);
      });
    });

    describe('createCollection', () => {
      it('creates a new collection', async () => {
        const mockCollection = {
          id: 'col-new',
          user_id: userId,
          name: 'New Playlist',
          collection_type: 'playlist',
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockCollection,
          error: null,
        });

        const result = await repository.createCollection(
          userId,
          'New Playlist',
          'playlist'
        );

        expect(mockClient.mocks.from).toHaveBeenCalledWith('collections');
        expect(mockClient.mocks.insert).toHaveBeenCalledWith({
          user_id: userId,
          name: 'New Playlist',
          collection_type: 'playlist',
        });
        expect(result.name).toBe('New Playlist');
      });
    });

    describe('deleteCollection', () => {
      it('deletes a collection', async () => {
        mockClient.setPendingResult({
          data: null,
          error: null,
        });

        await repository.deleteCollection(userId, collectionId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('collections');
        expect(mockClient.mocks.delete).toHaveBeenCalled();
      });
    });

    describe('getCollectionItems', () => {
      it('returns items in a collection', async () => {
        const mockItems = [
          {
            id: 'item-1',
            collection_id: collectionId,
            file_id: 'file-1',
            position: 0,
            created_at: '2024-01-15T00:00:00Z',
            torrent_files: {
              id: 'file-1',
              name: 'Song 1.mp3',
              path: '/music/Song 1.mp3',
              size: 5000000,
              media_category: 'audio',
            },
          },
        ];

        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockItems,
          error: null,
        });

        const result = await repository.getCollectionItems(collectionId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('collection_items');
        expect(result).toHaveLength(1);
      });
    });

    describe('addToCollection', () => {
      it('adds a file to a collection', async () => {
        const mockItem = {
          id: 'item-new',
          collection_id: collectionId,
          file_id: 'file-1',
          position: 0,
          created_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockItem,
          error: null,
        });

        const result = await repository.addToCollection(
          collectionId,
          'file-1',
          0
        );

        expect(mockClient.mocks.from).toHaveBeenCalledWith('collection_items');
        expect(result.file_id).toBe('file-1');
      });
    });

    describe('removeFromCollection', () => {
      it('removes a file from a collection', async () => {
        mockClient.setPendingResult({
          data: null,
          error: null,
        });

        await repository.removeFromCollection(collectionId, 'file-1');

        expect(mockClient.mocks.from).toHaveBeenCalledWith('collection_items');
        expect(mockClient.mocks.delete).toHaveBeenCalled();
      });
    });
  });

  describe('Watch Progress (History)', () => {
    const userId = 'user-123';
    const fileId = 'file-456';

    describe('getWatchHistory', () => {
      it('returns user watch history', async () => {
        const mockHistory = [
          {
            id: 'wp-1',
            user_id: userId,
            file_id: fileId,
            current_time_seconds: 3600,
            duration_seconds: 7200,
            percentage: 50,
            last_watched_at: '2024-01-15T00:00:00Z',
            torrent_files: {
              id: fileId,
              name: 'Movie.mp4',
              path: '/movies/Movie.mp4',
              size: 1500000000,
              media_category: 'video',
            },
          },
        ];

        mockClient.mocks.limit.mockResolvedValueOnce({
          data: mockHistory,
          error: null,
        });

        const result = await repository.getWatchHistory(userId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('watch_progress');
        expect(result).toHaveLength(1);
        expect(result[0].percentage).toBe(50);
      });

      it('limits results to specified count', async () => {
        mockClient.mocks.limit.mockResolvedValueOnce({
          data: [],
          error: null,
        });

        await repository.getWatchHistory(userId, 10);

        expect(mockClient.mocks.limit).toHaveBeenCalledWith(10);
      });
    });

    describe('updateWatchProgress', () => {
      it('updates watch progress for a file', async () => {
        const mockProgress = {
          id: 'wp-1',
          user_id: userId,
          file_id: fileId,
          current_time_seconds: 1800,
          duration_seconds: 7200,
          percentage: 25,
          last_watched_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockProgress,
          error: null,
        });

        const result = await repository.updateWatchProgress(
          userId,
          fileId,
          1800,
          7200
        );

        expect(mockClient.mocks.from).toHaveBeenCalledWith('watch_progress');
        expect(mockClient.mocks.upsert).toHaveBeenCalled();
        expect(result.current_time_seconds).toBe(1800);
      });
    });

    describe('getWatchProgress', () => {
      it('returns watch progress for a specific file', async () => {
        const mockProgress = {
          id: 'wp-1',
          user_id: userId,
          file_id: fileId,
          current_time_seconds: 1800,
          duration_seconds: 7200,
          percentage: 25,
          last_watched_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: mockProgress,
          error: null,
        });

        const result = await repository.getWatchProgress(userId, fileId);

        expect(result).not.toBeNull();
        expect(result?.current_time_seconds).toBe(1800);
      });

      it('returns null when no progress exists', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: null,
          error: null,
        });

        const result = await repository.getWatchProgress(userId, fileId);

        expect(result).toBeNull();
      });
    });
  });

  describe('Reading Progress', () => {
    const userId = 'user-123';
    const fileId = 'file-456';

    describe('getReadingHistory', () => {
      it('returns user reading history', async () => {
        const mockHistory = [
          {
            id: 'rp-1',
            user_id: userId,
            file_id: fileId,
            current_page: 50,
            total_pages: 200,
            percentage: 25,
            last_read_at: '2024-01-15T00:00:00Z',
            torrent_files: {
              id: fileId,
              name: 'Book.epub',
              path: '/books/Book.epub',
              size: 500000,
              media_category: 'ebook',
            },
          },
        ];

        mockClient.mocks.limit.mockResolvedValueOnce({
          data: mockHistory,
          error: null,
        });

        const result = await repository.getReadingHistory(userId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('reading_progress');
        expect(result).toHaveLength(1);
        expect(result[0].current_page).toBe(50);
      });
    });

    describe('updateReadingProgress', () => {
      it('updates reading progress for a file', async () => {
        const mockProgress = {
          id: 'rp-1',
          user_id: userId,
          file_id: fileId,
          current_page: 100,
          total_pages: 200,
          percentage: 50,
          last_read_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockProgress,
          error: null,
        });

        const result = await repository.updateReadingProgress(
          userId,
          fileId,
          100,
          200
        );

        expect(mockClient.mocks.from).toHaveBeenCalledWith('reading_progress');
        expect(mockClient.mocks.upsert).toHaveBeenCalled();
        expect(result.current_page).toBe(100);
      });
    });

    describe('getReadingProgress', () => {
      it('returns reading progress for a specific file', async () => {
        const mockProgress = {
          id: 'rp-1',
          user_id: userId,
          file_id: fileId,
          current_page: 100,
          total_pages: 200,
          percentage: 50,
          last_read_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: mockProgress,
          error: null,
        });

        const result = await repository.getReadingProgress(userId, fileId);

        expect(result).not.toBeNull();
        expect(result?.current_page).toBe(100);
      });
    });
  });

  describe('Combined History', () => {
    const userId = 'user-123';

    describe('getCombinedHistory', () => {
      it('returns combined watch and reading history sorted by date', async () => {
        const mockWatchHistory = [
          {
            id: 'wp-1',
            user_id: userId,
            file_id: 'file-1',
            current_time_seconds: 3600,
            duration_seconds: 7200,
            percentage: 50,
            last_watched_at: '2024-01-15T12:00:00Z',
            torrent_files: {
              id: 'file-1',
              name: 'Movie.mp4',
              path: '/movies/Movie.mp4',
              size: 1500000000,
              media_category: 'video',
            },
          },
        ];

        const mockReadingHistory = [
          {
            id: 'rp-1',
            user_id: userId,
            file_id: 'file-2',
            current_page: 50,
            total_pages: 200,
            percentage: 25,
            last_read_at: '2024-01-15T14:00:00Z',
            torrent_files: {
              id: 'file-2',
              name: 'Book.epub',
              path: '/books/Book.epub',
              size: 500000,
              media_category: 'ebook',
            },
          },
        ];

        // First call for watch_progress
        mockClient.mocks.limit.mockResolvedValueOnce({
          data: mockWatchHistory,
          error: null,
        });

        // Second call for reading_progress
        mockClient.mocks.limit.mockResolvedValueOnce({
          data: mockReadingHistory,
          error: null,
        });

        const result = await repository.getCombinedHistory(userId);

        expect(result).toHaveLength(2);
        // Reading history should come first (more recent)
        expect(result[0].type).toBe('reading');
        expect(result[1].type).toBe('watch');
      });
    });
  });
});
