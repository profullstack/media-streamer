/**
 * Watchlist Repository Tests
 *
 * Tests for user watchlist operations: CRUD for watchlists and items.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import { WatchlistRepository, type AddWatchlistItemInput } from './repository';

// Mock Supabase client (same pattern as library/repository.test.ts)
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

  let pendingResult: { data: unknown; error: unknown } | null = null;

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
      then: (resolve: (value: unknown) => void) => {
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

  const setPendingResult = (result: { data: unknown; error: unknown }) => {
    pendingResult = result;
  };

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
    setPendingResult,
  };
}

describe('WatchlistRepository', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let repository: WatchlistRepository;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    repository = new WatchlistRepository(mockClient.client);
  });

  describe('getUserWatchlists', () => {
    const userId = 'user-123';

    it('returns user watchlists with item counts', async () => {
      const mockWatchlists = [
        {
          id: 'wl-1',
          user_id: userId,
          name: 'My Watchlist',
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          watchlist_items: [{ count: 3 }],
        },
      ];

      mockClient.mocks.order.mockResolvedValueOnce({
        data: mockWatchlists,
        error: null,
      });

      const result = await repository.getUserWatchlists(userId);

      expect(mockClient.mocks.from).toHaveBeenCalledWith('user_watchlists');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('My Watchlist');
      expect(result[0].item_count).toBe(3);
    });

    it('returns empty array when user has no watchlists', async () => {
      mockClient.mocks.order.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await repository.getUserWatchlists(userId);

      expect(result).toEqual([]);
    });

    it('throws error on database failure', async () => {
      mockClient.mocks.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error', code: '500' },
      });

      await expect(repository.getUserWatchlists(userId)).rejects.toThrow(
        'Failed to fetch watchlists'
      );
    });
  });

  describe('createWatchlist', () => {
    const userId = 'user-123';

    it('creates a new watchlist', async () => {
      const mockWatchlist = {
        id: 'wl-new',
        user_id: userId,
        name: 'Action Movies',
        created_at: '2024-01-15T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };

      mockClient.mocks.single.mockResolvedValueOnce({
        data: mockWatchlist,
        error: null,
      });

      const result = await repository.createWatchlist(userId, 'Action Movies');

      expect(mockClient.mocks.from).toHaveBeenCalledWith('user_watchlists');
      expect(mockClient.mocks.insert).toHaveBeenCalledWith({
        profile_id: userId,
        name: 'Action Movies',
      });
      expect(result.name).toBe('Action Movies');
      expect(result.item_count).toBe(0);
    });

    it('throws error on database failure', async () => {
      mockClient.mocks.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB error', code: '500' },
      });

      await expect(repository.createWatchlist(userId, 'Test')).rejects.toThrow(
        'Failed to create watchlist'
      );
    });
  });

  describe('renameWatchlist', () => {
    const userId = 'user-123';
    const watchlistId = 'wl-1';

    it('renames a watchlist', async () => {
      const mockWatchlist = {
        id: watchlistId,
        user_id: userId,
        name: 'Renamed List',
        created_at: '2024-01-15T00:00:00Z',
        updated_at: '2024-01-16T00:00:00Z',
      };

      mockClient.mocks.single.mockResolvedValueOnce({
        data: mockWatchlist,
        error: null,
      });

      const result = await repository.renameWatchlist(userId, watchlistId, 'Renamed List');

      expect(mockClient.mocks.from).toHaveBeenCalledWith('user_watchlists');
      expect(mockClient.mocks.update).toHaveBeenCalled();
      expect(result.name).toBe('Renamed List');
    });

    it('throws error on database failure', async () => {
      mockClient.mocks.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB error', code: '500' },
      });

      await expect(repository.renameWatchlist(userId, watchlistId, 'New')).rejects.toThrow(
        'Failed to rename watchlist'
      );
    });
  });

  describe('deleteWatchlist', () => {
    const userId = 'user-123';
    const watchlistId = 'wl-1';

    it('deletes a watchlist', async () => {
      mockClient.setPendingResult({
        data: null,
        error: null,
      });

      await repository.deleteWatchlist(userId, watchlistId);

      expect(mockClient.mocks.from).toHaveBeenCalledWith('user_watchlists');
      expect(mockClient.mocks.delete).toHaveBeenCalled();
    });

    it('throws error on database failure', async () => {
      mockClient.setPendingResult({
        data: null,
        error: { message: 'Database error', code: '500' },
      });

      await expect(repository.deleteWatchlist(userId, watchlistId)).rejects.toThrow(
        'Failed to delete watchlist'
      );
    });
  });

  describe('getWatchlistItems', () => {
    const watchlistId = 'wl-1';

    it('returns items in a watchlist', async () => {
      const mockItems = [
        {
          id: 'item-1',
          watchlist_id: watchlistId,
          tmdb_id: 123,
          media_type: 'movie',
          title: 'Test Movie',
          poster_path: '/poster.jpg',
          overview: 'A test movie',
          release_date: '2024-06-01',
          vote_average: 7.5,
          genres: ['Action', 'Drama'],
          cast_names: ['Actor 1'],
          directors: ['Director 1'],
          position: 0,
          created_at: '2024-01-15T00:00:00Z',
        },
      ];

      mockClient.mocks.order.mockResolvedValueOnce({
        data: mockItems,
        error: null,
      });

      const result = await repository.getWatchlistItems(watchlistId);

      expect(mockClient.mocks.from).toHaveBeenCalledWith('watchlist_items');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Movie');
    });

    it('returns empty array for empty watchlist', async () => {
      mockClient.mocks.order.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await repository.getWatchlistItems(watchlistId);

      expect(result).toEqual([]);
    });

    it('throws error on database failure', async () => {
      mockClient.mocks.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error', code: '500' },
      });

      await expect(repository.getWatchlistItems(watchlistId)).rejects.toThrow(
        'Failed to fetch watchlist items'
      );
    });
  });

  describe('addItem', () => {
    const watchlistId = 'wl-1';
    const input: AddWatchlistItemInput = {
      tmdbId: 123,
      mediaType: 'movie',
      title: 'Test Movie',
      posterPath: '/poster.jpg',
      overview: 'A test movie',
      releaseDate: '2024-06-01',
      voteAverage: 7.5,
      genres: ['Action'],
      castNames: ['Actor 1'],
      directors: ['Director 1'],
    };

    it('adds an item to a watchlist', async () => {
      // First call: get max position
      mockClient.mocks.limit.mockResolvedValueOnce({
        data: [{ position: 2 }],
        error: null,
      });

      // Second call: insert item
      mockClient.mocks.single.mockResolvedValueOnce({
        data: {
          id: 'item-new',
          watchlist_id: watchlistId,
          tmdb_id: 123,
          media_type: 'movie',
          title: 'Test Movie',
          position: 3,
          created_at: '2024-01-15T00:00:00Z',
        },
        error: null,
      });

      // Third call: update watchlist timestamp (thenable)
      mockClient.setPendingResult({ data: null, error: null });

      const result = await repository.addItem(watchlistId, input);

      expect(result.title).toBe('Test Movie');
    });

    it('throws "Item already in watchlist" on duplicate (23505)', async () => {
      // First call: get max position
      mockClient.mocks.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      // Second call: insert fails with duplicate
      mockClient.mocks.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'duplicate key', code: '23505' },
      });

      await expect(repository.addItem(watchlistId, input)).rejects.toThrow(
        'Item already in watchlist'
      );
    });

    it('throws generic error on other database failures', async () => {
      mockClient.mocks.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      mockClient.mocks.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Connection failed', code: '500' },
      });

      await expect(repository.addItem(watchlistId, input)).rejects.toThrow(
        'Failed to add item'
      );
    });
  });

  describe('removeItem', () => {
    const watchlistId = 'wl-1';

    it('removes an item from a watchlist', async () => {
      mockClient.setPendingResult({
        data: null,
        error: null,
      });

      await repository.removeItem(watchlistId, 123, 'movie');

      expect(mockClient.mocks.from).toHaveBeenCalledWith('watchlist_items');
      expect(mockClient.mocks.delete).toHaveBeenCalled();
    });

    it('throws error on database failure', async () => {
      mockClient.setPendingResult({
        data: null,
        error: { message: 'Database error', code: '500' },
      });

      await expect(repository.removeItem(watchlistId, 123, 'movie')).rejects.toThrow(
        'Failed to remove item'
      );
    });
  });

  describe('getOrCreateDefaultWatchlist', () => {
    const userId = 'user-123';

    it('returns existing watchlist if one exists', async () => {
      const mockWatchlists = [
        {
          id: 'wl-1',
          user_id: userId,
          name: 'My Watchlist',
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
          watchlist_items: [{ count: 0 }],
        },
      ];

      mockClient.mocks.order.mockResolvedValueOnce({
        data: mockWatchlists,
        error: null,
      });

      const result = await repository.getOrCreateDefaultWatchlist(userId);

      expect(result.name).toBe('My Watchlist');
    });

    it('creates default watchlist when none exist', async () => {
      // First call: getUserWatchlists returns empty
      mockClient.mocks.order.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      // Second call: createWatchlist
      mockClient.mocks.single.mockResolvedValueOnce({
        data: {
          id: 'wl-new',
          user_id: userId,
          name: 'My Watchlist',
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
        },
        error: null,
      });

      const result = await repository.getOrCreateDefaultWatchlist(userId);

      expect(result.name).toBe('My Watchlist');
    });
  });

  describe('getWatchlistsContainingItem', () => {
    const userId = 'user-123';

    it('returns watchlist IDs containing the item', async () => {
      // First call: getUserWatchlists
      mockClient.mocks.order.mockResolvedValueOnce({
        data: [
          {
            id: 'wl-1',
            user_id: userId,
            name: 'List 1',
            created_at: '2024-01-15T00:00:00Z',
            updated_at: '2024-01-15T00:00:00Z',
            watchlist_items: [{ count: 1 }],
          },
        ],
        error: null,
      });

      // Second call: query watchlist_items for matches
      mockClient.setPendingResult({
        data: [{ watchlist_id: 'wl-1' }],
        error: null,
      });

      const result = await repository.getWatchlistsContainingItem(userId, 123, 'movie');

      expect(result).toEqual(['wl-1']);
    });

    it('returns empty array when user has no watchlists', async () => {
      mockClient.mocks.order.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await repository.getWatchlistsContainingItem(userId, 123, 'movie');

      expect(result).toEqual([]);
    });
  });
});
