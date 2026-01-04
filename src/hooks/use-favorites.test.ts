/**
 * Tests for useFavorites hooks
 *
 * Tests the React hooks for managing favorites state and API interactions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useTorrentFavorite,
  useIptvChannelFavorite,
  useTorrentFavorites,
  useIptvChannelFavorites,
} from './use-favorites';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useTorrentFavorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with provided favorite state', () => {
    const { result } = renderHook(() =>
      useTorrentFavorite('torrent-123', true)
    );

    expect(result.current.isFavorited).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('initializes with false when not provided', () => {
    const { result } = renderHook(() => useTorrentFavorite('torrent-123'));

    expect(result.current.isFavorited).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('adds torrent to favorites on toggle when not favorited', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        favorite: {
          id: 'fav-1',
          user_id: 'user-1',
          torrent_id: 'torrent-123',
          created_at: new Date().toISOString(),
        },
      }),
    });

    const { result } = renderHook(() =>
      useTorrentFavorite('torrent-123', false)
    );

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/favorites/torrents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ torrentId: 'torrent-123' }),
    });

    expect(result.current.isFavorited).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('removes torrent from favorites on toggle when favorited', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() =>
      useTorrentFavorite('torrent-123', true)
    );

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/favorites/torrents', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ torrentId: 'torrent-123' }),
    });

    expect(result.current.isFavorited).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Failed to add favorite' }),
    });

    const { result } = renderHook(() =>
      useTorrentFavorite('torrent-123', false)
    );

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.isFavorited).toBe(false);
    expect(result.current.error).toBe('Failed to add favorite');
  });

  it('sets loading state during API call', async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(promise);

    const { result } = renderHook(() =>
      useTorrentFavorite('torrent-123', false)
    );

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: async () => ({ favorite: { id: 'fav-1' } }),
      });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useTorrentFavorite('torrent-123', false)
    );

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.isFavorited).toBe(false);
    expect(result.current.error).toBe('Network error');
  });
});

describe('useIptvChannelFavorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const channelData = {
    playlistId: 'playlist-1',
    channelId: 'channel-1',
    channelName: 'Test Channel',
    channelUrl: 'http://example.com/stream.m3u8',
    channelLogo: 'http://example.com/logo.png',
    channelGroup: 'Sports',
  };

  it('initializes with provided favorite state', () => {
    const { result } = renderHook(() =>
      useIptvChannelFavorite(channelData, true)
    );

    expect(result.current.isFavorited).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('adds channel to favorites on toggle when not favorited', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        favorite: {
          id: 'fav-1',
          user_id: 'user-1',
          playlist_id: 'playlist-1',
          channel_id: 'channel-1',
          channel_name: 'Test Channel',
          channel_url: 'http://example.com/stream.m3u8',
          created_at: new Date().toISOString(),
        },
      }),
    });

    const { result } = renderHook(() =>
      useIptvChannelFavorite(channelData, false)
    );

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/favorites/iptv-channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(channelData),
    });

    expect(result.current.isFavorited).toBe(true);
  });

  it('removes channel from favorites on toggle when favorited', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() =>
      useIptvChannelFavorite(channelData, true)
    );

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/favorites/iptv-channels', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlistId: channelData.playlistId,
        channelId: channelData.channelId,
      }),
    });

    expect(result.current.isFavorited).toBe(false);
  });

  it('sets error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Channel already in favorites' }),
    });

    const { result } = renderHook(() =>
      useIptvChannelFavorite(channelData, false)
    );

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.isFavorited).toBe(false);
    expect(result.current.error).toBe('Channel already in favorites');
  });
});

describe('useTorrentFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches favorites on mount', async () => {
    const mockFavorites = [
      {
        id: 'fav-1',
        user_id: 'user-1',
        torrent_id: 'torrent-1',
        created_at: new Date().toISOString(),
        torrent: {
          id: 'torrent-1',
          name: 'Test Torrent',
          infohash: 'abc123',
        },
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ favorites: mockFavorites }),
    });

    const { result } = renderHook(() => useTorrentFavorites());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/favorites/torrents');
    expect(result.current.favorites).toEqual(mockFavorites);
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Failed to fetch favorites' }),
    });

    const { result } = renderHook(() => useTorrentFavorites());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.favorites).toEqual([]);
    expect(result.current.error).toBe('Failed to fetch favorites');
  });

  it('provides refetch function', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ favorites: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          favorites: [
            {
              id: 'fav-1',
              user_id: 'user-1',
              torrent_id: 'torrent-1',
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });

    const { result } = renderHook(() => useTorrentFavorites());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.favorites).toEqual([]);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.favorites).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('checks if torrent is favorited', async () => {
    const mockFavorites = [
      {
        id: 'fav-1',
        user_id: 'user-1',
        torrent_id: 'torrent-1',
        created_at: new Date().toISOString(),
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ favorites: mockFavorites }),
    });

    const { result } = renderHook(() => useTorrentFavorites());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFavorited('torrent-1')).toBe(true);
    expect(result.current.isFavorited('torrent-2')).toBe(false);
  });
});

describe('useIptvChannelFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches favorites on mount', async () => {
    const mockFavorites = [
      {
        id: 'fav-1',
        user_id: 'user-1',
        playlist_id: 'playlist-1',
        channel_id: 'channel-1',
        channel_name: 'Test Channel',
        channel_url: 'http://example.com/stream.m3u8',
        created_at: new Date().toISOString(),
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ favorites: mockFavorites }),
    });

    const { result } = renderHook(() => useIptvChannelFavorites());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/favorites/iptv-channels');
    expect(result.current.favorites).toEqual(mockFavorites);
  });

  it('fetches favorites filtered by playlist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ favorites: [] }),
    });

    const { result } = renderHook(() =>
      useIptvChannelFavorites('playlist-123')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/favorites/iptv-channels?playlistId=playlist-123'
    );
  });

  it('checks if channel is favorited', async () => {
    const mockFavorites = [
      {
        id: 'fav-1',
        user_id: 'user-1',
        playlist_id: 'playlist-1',
        channel_id: 'channel-1',
        channel_name: 'Test Channel',
        channel_url: 'http://example.com/stream.m3u8',
        created_at: new Date().toISOString(),
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ favorites: mockFavorites }),
    });

    const { result } = renderHook(() => useIptvChannelFavorites());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFavorited('playlist-1', 'channel-1')).toBe(true);
    expect(result.current.isFavorited('playlist-1', 'channel-2')).toBe(false);
    expect(result.current.isFavorited('playlist-2', 'channel-1')).toBe(false);
  });

  it('sets error on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Authentication required' }),
    });

    const { result } = renderHook(() => useIptvChannelFavorites());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.favorites).toEqual([]);
    expect(result.current.error).toBe('Authentication required');
  });
});
