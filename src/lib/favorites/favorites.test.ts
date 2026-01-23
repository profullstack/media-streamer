/**
 * Favorites Service Tests
 *
 * Tests for torrent and IPTV channel favorites operations
 * Server-side only - all Supabase calls are server-side
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import {
  FavoritesService,
  type TorrentFavoriteWithDetails,
  type IptvChannelFavoriteWithDetails,
  type AddIptvChannelFavoriteInput,
} from './favorites';

// Mock Supabase client
function createMockSupabaseClient() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockOrder = vi.fn();
  const mockSingle = vi.fn();
  const mockMaybeSingle = vi.fn();

  // Store for pending results that should be returned when awaited
  let pendingResult: { data: unknown; error: unknown } | null = null;

  // Create a thenable chainable mock - it's both chainable AND awaitable
  const createThenableChainable = (): Record<string, unknown> => {
    const chainable: Record<string, unknown> = {
      select: mockSelect,
      insert: mockInsert,
      delete: mockDelete,
      eq: mockEq,
      order: mockOrder,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
      // Make it thenable so it can be awaited
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

  // Helper to set the pending result for the next await
  const setPendingResult = (result: { data: unknown; error: unknown }) => {
    pendingResult = result;
  };

  // Make all methods chainable by returning the thenable chainable object
  mockSelect.mockImplementation(() => createThenableChainable());
  mockInsert.mockImplementation(() => createThenableChainable());
  mockDelete.mockImplementation(() => createThenableChainable());
  mockEq.mockImplementation(() => createThenableChainable());
  mockOrder.mockImplementation(() => createThenableChainable());
  mockSingle.mockImplementation(() => createThenableChainable());
  mockMaybeSingle.mockImplementation(() => createThenableChainable());

  const mockFrom = vi.fn().mockImplementation(() => createThenableChainable());

  return {
    client: { from: mockFrom } as unknown as SupabaseClient<Database>,
    mocks: {
      from: mockFrom,
      select: mockSelect,
      insert: mockInsert,
      delete: mockDelete,
      eq: mockEq,
      order: mockOrder,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    },
    // Helper to set the result for the next await
    setPendingResult,
  };
}

describe('FavoritesService', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let service: FavoritesService;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    service = new FavoritesService(mockClient.client);
  });

  describe('Torrent Favorites', () => {
    const userId = 'user-123';
    const torrentId = 'torrent-456';

    describe('getTorrentFavorites', () => {
      it('returns user torrent favorites with torrent details', async () => {
        const mockFavorites = [
          {
            id: 'fav-1',
            user_id: userId,
            torrent_id: torrentId,
            created_at: '2024-01-15T00:00:00Z',
            bt_torrents: {
              id: torrentId,
              name: 'Test Movie',
              infohash: 'abc123def456',
              total_size: 1500000000,
              file_count: 1,
              poster_url: 'https://example.com/poster.jpg',
              content_type: 'movie',
              year: 2024,
              seeders: 50,
              leechers: 10,
            },
          },
        ];

        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockFavorites,
          error: null,
        });

        const result = await service.getTorrentFavorites(userId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('bt_torrent_favorites');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('fav-1');
        expect(result[0].torrent_id).toBe(torrentId);
        expect(result[0].bt_torrents?.name).toBe('Test Movie');
      });

      it('returns empty array when user has no torrent favorites', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: [],
          error: null,
        });

        const result = await service.getTorrentFavorites(userId);

        expect(result).toEqual([]);
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(service.getTorrentFavorites(userId)).rejects.toThrow(
          'Failed to fetch torrent favorites'
        );
      });
    });

    describe('addTorrentFavorite', () => {
      it('adds a torrent to favorites', async () => {
        const mockFavorite = {
          id: 'fav-new',
          user_id: userId,
          torrent_id: torrentId,
          created_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockFavorite,
          error: null,
        });

        const result = await service.addTorrentFavorite(userId, torrentId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('bt_torrent_favorites');
        expect(mockClient.mocks.insert).toHaveBeenCalledWith({
          user_id: userId,
          torrent_id: torrentId,
        });
        expect(result.id).toBe('fav-new');
      });

      it('throws error when torrent already favorited', async () => {
        mockClient.mocks.single.mockResolvedValueOnce({
          data: null,
          error: { message: 'duplicate key', code: '23505' },
        });

        await expect(
          service.addTorrentFavorite(userId, torrentId)
        ).rejects.toThrow('Torrent already in favorites');
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.single.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(
          service.addTorrentFavorite(userId, torrentId)
        ).rejects.toThrow('Failed to add torrent favorite');
      });
    });

    describe('removeTorrentFavorite', () => {
      it('removes a torrent from favorites', async () => {
        mockClient.setPendingResult({
          data: null,
          error: null,
        });

        await service.removeTorrentFavorite(userId, torrentId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('bt_torrent_favorites');
        expect(mockClient.mocks.delete).toHaveBeenCalled();
      });

      it('throws error on database failure', async () => {
        mockClient.setPendingResult({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(
          service.removeTorrentFavorite(userId, torrentId)
        ).rejects.toThrow('Failed to remove torrent favorite');
      });
    });

    describe('isTorrentFavorite', () => {
      it('returns true when torrent is favorited', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: { id: 'fav-1' },
          error: null,
        });

        const result = await service.isTorrentFavorite(userId, torrentId);

        expect(result).toBe(true);
      });

      it('returns false when torrent is not favorited', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: null,
          error: null,
        });

        const result = await service.isTorrentFavorite(userId, torrentId);

        expect(result).toBe(false);
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(
          service.isTorrentFavorite(userId, torrentId)
        ).rejects.toThrow('Failed to check torrent favorite');
      });
    });

    describe('getTorrentFavoritesCount', () => {
      it('returns the count of favorites for a torrent', async () => {
        mockClient.mocks.eq.mockResolvedValueOnce({
          count: 42,
          error: null,
        });

        const result = await service.getTorrentFavoritesCount(torrentId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith('bt_torrent_favorites');
        expect(result).toBe(42);
      });

      it('returns 0 when torrent has no favorites', async () => {
        mockClient.mocks.eq.mockResolvedValueOnce({
          count: 0,
          error: null,
        });

        const result = await service.getTorrentFavoritesCount(torrentId);

        expect(result).toBe(0);
      });

      it('returns 0 when count is null', async () => {
        mockClient.mocks.eq.mockResolvedValueOnce({
          count: null,
          error: null,
        });

        const result = await service.getTorrentFavoritesCount(torrentId);

        expect(result).toBe(0);
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.eq.mockResolvedValueOnce({
          count: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(
          service.getTorrentFavoritesCount(torrentId)
        ).rejects.toThrow('Failed to get torrent favorites count');
      });
    });
  });

  describe('IPTV Channel Favorites', () => {
    const userId = 'user-123';
    const playlistId = 'playlist-456';
    const channelId = 'ch_abc123_0';

    const mockChannelInput: AddIptvChannelFavoriteInput = {
      playlistId,
      channelId,
      channelName: 'ESPN HD',
      channelUrl: 'https://stream.example.com/espn.m3u8',
      channelLogo: 'https://example.com/espn-logo.png',
      channelGroup: 'Sports',
      tvgId: 'espn.us',
      tvgName: 'ESPN',
    };

    describe('getIptvChannelFavorites', () => {
      it('returns user IPTV channel favorites with playlist details', async () => {
        const mockFavorites = [
          {
            id: 'fav-1',
            user_id: userId,
            playlist_id: playlistId,
            channel_id: channelId,
            channel_name: 'ESPN HD',
            channel_url: 'https://stream.example.com/espn.m3u8',
            channel_logo: 'https://example.com/espn-logo.png',
            channel_group: 'Sports',
            tvg_id: 'espn.us',
            tvg_name: 'ESPN',
            created_at: '2024-01-15T00:00:00Z',
            iptv_playlists: {
              id: playlistId,
              name: 'My IPTV',
              m3u_url: 'https://example.com/playlist.m3u',
            },
          },
        ];

        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockFavorites,
          error: null,
        });

        const result = await service.getIptvChannelFavorites(userId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith(
          'iptv_channel_favorites'
        );
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('fav-1');
        expect(result[0].channel_name).toBe('ESPN HD');
        expect(result[0].iptv_playlists?.name).toBe('My IPTV');
      });

      it('returns empty array when user has no IPTV channel favorites', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: [],
          error: null,
        });

        const result = await service.getIptvChannelFavorites(userId);

        expect(result).toEqual([]);
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(service.getIptvChannelFavorites(userId)).rejects.toThrow(
          'Failed to fetch IPTV channel favorites'
        );
      });
    });

    describe('getIptvChannelFavoritesByPlaylist', () => {
      it('returns IPTV channel favorites for a specific playlist', async () => {
        const mockFavorites = [
          {
            id: 'fav-1',
            user_id: userId,
            playlist_id: playlistId,
            channel_id: channelId,
            channel_name: 'ESPN HD',
            channel_url: 'https://stream.example.com/espn.m3u8',
            channel_logo: 'https://example.com/espn-logo.png',
            channel_group: 'Sports',
            tvg_id: 'espn.us',
            tvg_name: 'ESPN',
            created_at: '2024-01-15T00:00:00Z',
          },
        ];

        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockFavorites,
          error: null,
        });

        const result = await service.getIptvChannelFavoritesByPlaylist(
          userId,
          playlistId
        );

        expect(mockClient.mocks.from).toHaveBeenCalledWith(
          'iptv_channel_favorites'
        );
        expect(result).toHaveLength(1);
        expect(result[0].playlist_id).toBe(playlistId);
      });
    });

    describe('addIptvChannelFavorite', () => {
      it('adds an IPTV channel to favorites', async () => {
        const mockFavorite = {
          id: 'fav-new',
          user_id: userId,
          playlist_id: playlistId,
          channel_id: channelId,
          channel_name: 'ESPN HD',
          channel_url: 'https://stream.example.com/espn.m3u8',
          channel_logo: 'https://example.com/espn-logo.png',
          channel_group: 'Sports',
          tvg_id: 'espn.us',
          tvg_name: 'ESPN',
          created_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockFavorite,
          error: null,
        });

        const result = await service.addIptvChannelFavorite(
          userId,
          mockChannelInput
        );

        expect(mockClient.mocks.from).toHaveBeenCalledWith(
          'iptv_channel_favorites'
        );
        expect(mockClient.mocks.insert).toHaveBeenCalledWith({
          user_id: userId,
          playlist_id: playlistId,
          channel_id: channelId,
          channel_name: 'ESPN HD',
          channel_url: 'https://stream.example.com/espn.m3u8',
          channel_logo: 'https://example.com/espn-logo.png',
          channel_group: 'Sports',
          tvg_id: 'espn.us',
          tvg_name: 'ESPN',
        });
        expect(result.id).toBe('fav-new');
      });

      it('adds an IPTV channel with minimal data', async () => {
        const minimalInput: AddIptvChannelFavoriteInput = {
          playlistId,
          channelId,
          channelName: 'Test Channel',
          channelUrl: 'https://stream.example.com/test.m3u8',
        };

        const mockFavorite = {
          id: 'fav-new',
          user_id: userId,
          playlist_id: playlistId,
          channel_id: channelId,
          channel_name: 'Test Channel',
          channel_url: 'https://stream.example.com/test.m3u8',
          channel_logo: null,
          channel_group: null,
          tvg_id: null,
          tvg_name: null,
          created_at: '2024-01-15T00:00:00Z',
        };

        mockClient.mocks.single.mockResolvedValueOnce({
          data: mockFavorite,
          error: null,
        });

        const result = await service.addIptvChannelFavorite(
          userId,
          minimalInput
        );

        expect(mockClient.mocks.insert).toHaveBeenCalledWith({
          user_id: userId,
          playlist_id: playlistId,
          channel_id: channelId,
          channel_name: 'Test Channel',
          channel_url: 'https://stream.example.com/test.m3u8',
          channel_logo: undefined,
          channel_group: undefined,
          tvg_id: undefined,
          tvg_name: undefined,
        });
        expect(result.id).toBe('fav-new');
      });

      it('throws error when channel already favorited', async () => {
        mockClient.mocks.single.mockResolvedValueOnce({
          data: null,
          error: { message: 'duplicate key', code: '23505' },
        });

        await expect(
          service.addIptvChannelFavorite(userId, mockChannelInput)
        ).rejects.toThrow('Channel already in favorites');
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.single.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(
          service.addIptvChannelFavorite(userId, mockChannelInput)
        ).rejects.toThrow('Failed to add IPTV channel favorite');
      });
    });

    describe('removeIptvChannelFavorite', () => {
      it('removes an IPTV channel from favorites', async () => {
        mockClient.setPendingResult({
          data: null,
          error: null,
        });

        await service.removeIptvChannelFavorite(userId, playlistId, channelId);

        expect(mockClient.mocks.from).toHaveBeenCalledWith(
          'iptv_channel_favorites'
        );
        expect(mockClient.mocks.delete).toHaveBeenCalled();
      });

      it('throws error on database failure', async () => {
        mockClient.setPendingResult({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(
          service.removeIptvChannelFavorite(userId, playlistId, channelId)
        ).rejects.toThrow('Failed to remove IPTV channel favorite');
      });
    });

    describe('isIptvChannelFavorite', () => {
      it('returns true when channel is favorited', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: { id: 'fav-1' },
          error: null,
        });

        const result = await service.isIptvChannelFavorite(
          userId,
          playlistId,
          channelId
        );

        expect(result).toBe(true);
      });

      it('returns false when channel is not favorited', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: null,
          error: null,
        });

        const result = await service.isIptvChannelFavorite(
          userId,
          playlistId,
          channelId
        );

        expect(result).toBe(false);
      });

      it('throws error on database failure', async () => {
        mockClient.mocks.maybeSingle.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error', code: '500' },
        });

        await expect(
          service.isIptvChannelFavorite(userId, playlistId, channelId)
        ).rejects.toThrow('Failed to check IPTV channel favorite');
      });
    });
  });

  describe('Combined Favorites', () => {
    const userId = 'user-123';

    describe('getAllFavorites', () => {
      it('returns combined torrent and IPTV channel favorites', async () => {
        const mockTorrentFavorites = [
          {
            id: 'tfav-1',
            user_id: userId,
            torrent_id: 'torrent-1',
            created_at: '2024-01-15T12:00:00Z',
            bt_torrents: {
              id: 'torrent-1',
              name: 'Test Movie',
              infohash: 'abc123',
            },
          },
        ];

        const mockIptvFavorites = [
          {
            id: 'ifav-1',
            user_id: userId,
            playlist_id: 'playlist-1',
            channel_id: 'ch_1',
            channel_name: 'ESPN HD',
            channel_url: 'https://stream.example.com/espn.m3u8',
            channel_logo: null,
            channel_group: 'Sports',
            tvg_id: null,
            tvg_name: null,
            created_at: '2024-01-15T14:00:00Z',
            iptv_playlists: {
              id: 'playlist-1',
              name: 'My IPTV',
            },
          },
        ];

        // First call for torrent_favorites
        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockTorrentFavorites,
          error: null,
        });

        // Second call for iptv_channel_favorites
        mockClient.mocks.order.mockResolvedValueOnce({
          data: mockIptvFavorites,
          error: null,
        });

        const result = await service.getAllFavorites(userId);

        expect(result.torrentFavorites).toHaveLength(1);
        expect(result.iptvChannelFavorites).toHaveLength(1);
        expect(result.torrentFavorites[0].bt_torrents?.name).toBe('Test Movie');
        expect(result.iptvChannelFavorites[0].channel_name).toBe('ESPN HD');
      });

      it('returns empty arrays when user has no favorites', async () => {
        mockClient.mocks.order.mockResolvedValueOnce({
          data: [],
          error: null,
        });

        mockClient.mocks.order.mockResolvedValueOnce({
          data: [],
          error: null,
        });

        const result = await service.getAllFavorites(userId);

        expect(result.torrentFavorites).toEqual([]);
        expect(result.iptvChannelFavorites).toEqual([]);
      });
    });
  });
});
