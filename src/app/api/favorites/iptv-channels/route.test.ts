/**
 * IPTV Channel Favorites API Route Tests
 *
 * Tests for GET, POST, DELETE /api/favorites/iptv-channels
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module
const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock the favorites service
const mockGetIptvChannelFavorites = vi.fn();
const mockGetIptvChannelFavoritesByPlaylist = vi.fn();
const mockAddIptvChannelFavorite = vi.fn();
const mockRemoveIptvChannelFavorite = vi.fn();
const mockIsIptvChannelFavorite = vi.fn();

vi.mock('@/lib/favorites', () => ({
  getFavoritesService: () => ({
    getIptvChannelFavorites: mockGetIptvChannelFavorites,
    getIptvChannelFavoritesByPlaylist: mockGetIptvChannelFavoritesByPlaylist,
    addIptvChannelFavorite: mockAddIptvChannelFavorite,
    removeIptvChannelFavorite: mockRemoveIptvChannelFavorite,
    isIptvChannelFavorite: mockIsIptvChannelFavorite,
  }),
}));

// Mock profiles
vi.mock('@/lib/profiles', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-123'),
}));


describe('GET /api/favorites/iptv-channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns all IPTV channel favorites when authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetIptvChannelFavorites.mockResolvedValue([
      {
        id: 'fav-1',
        user_id: 'user-123',
        playlist_id: 'playlist-1',
        channel_id: 'ch_1',
        channel_name: 'ESPN HD',
        channel_url: 'https://stream.example.com/espn.m3u8',
        channel_logo: 'https://example.com/espn-logo.png',
        channel_group: 'Sports',
        created_at: '2024-01-15T00:00:00Z',
        iptv_playlists: {
          id: 'playlist-1',
          name: 'My IPTV',
        },
      },
    ]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toHaveLength(1);
    expect(data.favorites[0].channel_name).toBe('ESPN HD');
    expect(mockGetIptvChannelFavorites).toHaveBeenCalledWith('profile-123');
  });

  it('returns favorites for specific playlist when playlistId provided', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetIptvChannelFavoritesByPlaylist.mockResolvedValue([
      {
        id: 'fav-1',
        user_id: 'user-123',
        playlist_id: 'playlist-1',
        channel_id: 'ch_1',
        channel_name: 'ESPN HD',
        channel_url: 'https://stream.example.com/espn.m3u8',
        created_at: '2024-01-15T00:00:00Z',
      },
    ]);

    const { GET } = await import('./route');
    const request = new Request(
      'http://localhost/api/favorites/iptv-channels?playlistId=playlist-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toHaveLength(1);
    expect(mockGetIptvChannelFavoritesByPlaylist).toHaveBeenCalledWith(
      'profile-123',
      'playlist-1'
    );
  });

  it('returns empty array when user has no favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetIptvChannelFavorites.mockResolvedValue([]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetIptvChannelFavorites.mockRejectedValue(new Error('Database error'));

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch IPTV channel favorites');
  });
});

describe('POST /api/favorites/iptv-channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validChannelInput = {
    playlistId: 'playlist-1',
    channelId: 'ch_1',
    channelName: 'ESPN HD',
    channelUrl: 'https://stream.example.com/espn.m3u8',
    channelLogo: 'https://example.com/espn-logo.png',
    channelGroup: 'Sports',
  };

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'POST',
      body: JSON.stringify(validChannelInput),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when required fields are missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'POST',
      body: JSON.stringify({ playlistId: 'playlist-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('required');
  });

  it('adds IPTV channel to favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddIptvChannelFavorite.mockResolvedValue({
      id: 'fav-new',
      user_id: 'user-123',
      playlist_id: 'playlist-1',
      channel_id: 'ch_1',
      channel_name: 'ESPN HD',
      channel_url: 'https://stream.example.com/espn.m3u8',
      channel_logo: 'https://example.com/espn-logo.png',
      channel_group: 'Sports',
      created_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'POST',
      body: JSON.stringify(validChannelInput),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.favorite.id).toBe('fav-new');
    expect(data.favorite.channel_name).toBe('ESPN HD');
    expect(mockAddIptvChannelFavorite).toHaveBeenCalledWith(
      'profile-123',
      expect.objectContaining({
        playlistId: 'playlist-1',
        channelId: 'ch_1',
        channelName: 'ESPN HD',
      })
    );
  });

  it('adds IPTV channel with minimal data', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddIptvChannelFavorite.mockResolvedValue({
      id: 'fav-new',
      user_id: 'user-123',
      playlist_id: 'playlist-1',
      channel_id: 'ch_1',
      channel_name: 'Test Channel',
      channel_url: 'https://stream.example.com/test.m3u8',
      channel_logo: null,
      channel_group: null,
      created_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'POST',
      body: JSON.stringify({
        playlistId: 'playlist-1',
        channelId: 'ch_1',
        channelName: 'Test Channel',
        channelUrl: 'https://stream.example.com/test.m3u8',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.favorite.id).toBe('fav-new');
  });

  it('returns 409 when channel already favorited', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddIptvChannelFavorite.mockRejectedValue(
      new Error('Channel already in favorites')
    );

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'POST',
      body: JSON.stringify(validChannelInput),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('Channel already in favorites');
  });

  it('returns 500 on service error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddIptvChannelFavorite.mockRejectedValue(new Error('Database error'));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'POST',
      body: JSON.stringify(validChannelInput),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to add IPTV channel favorite');
  });
});

describe('DELETE /api/favorites/iptv-channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'DELETE',
      body: JSON.stringify({
        playlistId: 'playlist-1',
        channelId: 'ch_1',
      }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when playlistId is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'DELETE',
      body: JSON.stringify({ channelId: 'ch_1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('playlistId and channelId are required');
  });

  it('returns 400 when channelId is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'DELETE',
      body: JSON.stringify({ playlistId: 'playlist-1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('playlistId and channelId are required');
  });

  it('removes IPTV channel from favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockRemoveIptvChannelFavorite.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'DELETE',
      body: JSON.stringify({
        playlistId: 'playlist-1',
        channelId: 'ch_1',
      }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRemoveIptvChannelFavorite).toHaveBeenCalledWith(
      'profile-123',
      'playlist-1',
      'ch_1'
    );
  });

  it('returns 500 on service error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockRemoveIptvChannelFavorite.mockRejectedValue(new Error('Database error'));

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/iptv-channels', {
      method: 'DELETE',
      body: JSON.stringify({
        playlistId: 'playlist-1',
        channelId: 'ch_1',
      }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to remove IPTV channel favorite');
  });
});
