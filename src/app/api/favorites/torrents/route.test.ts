/**
 * Torrent Favorites API Route Tests
 *
 * Tests for GET, POST, DELETE /api/favorites/torrents
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module
const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock the profiles module
vi.mock('@/lib/profiles', () => ({
  getCurrentProfileIdWithFallback: () => Promise.resolve('profile-default-123'),
}));

// Mock the favorites service
const mockGetTorrentFavorites = vi.fn();
const mockAddTorrentFavorite = vi.fn();
const mockRemoveTorrentFavorite = vi.fn();
const mockIsTorrentFavorite = vi.fn();

vi.mock('@/lib/favorites', () => ({
  getFavoritesService: () => ({
    getTorrentFavorites: mockGetTorrentFavorites,
    addTorrentFavorite: mockAddTorrentFavorite,
    removeTorrentFavorite: mockRemoveTorrentFavorite,
    isTorrentFavorite: mockIsTorrentFavorite,
  }),
}));

// Mock the supabase queries (for getUserTorrentId check)
const mockGetTorrentById = vi.fn();
const mockGetTorrentByInfohash = vi.fn();

vi.mock('@/lib/supabase/queries', () => ({
  getTorrentById: () => mockGetTorrentById(),
  getTorrentByInfohash: () => mockGetTorrentByInfohash(),
}));

describe('GET /api/favorites/torrents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock torrent lookup to return a valid torrent (so favorites are allowed)
    mockGetTorrentByInfohash.mockResolvedValue({ id: 'torrent-1' });
    mockGetTorrentById.mockResolvedValue(null);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns user torrent favorites when authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetTorrentFavorites.mockResolvedValue([
      {
        id: 'fav-1',
        user_id: 'user-123',
        torrent_id: 'torrent-1',
        created_at: '2024-01-15T00:00:00Z',
        torrents: {
          id: 'torrent-1',
          name: 'Test Movie',
          infohash: 'abc123',
          total_size: 1500000000,
          poster_url: 'https://example.com/poster.jpg',
        },
      },
    ]);

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toHaveLength(1);
    expect(data.favorites[0].id).toBe('fav-1');
    expect(data.favorites[0].torrents.name).toBe('Test Movie');
  });

  it('returns empty array when user has no favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetTorrentFavorites.mockResolvedValue([]);

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toEqual([]);
  });

  it('returns 500 on service error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetTorrentFavorites.mockRejectedValue(new Error('Database error'));

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch torrent favorites');
  });
});

describe('POST /api/favorites/torrents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock torrent lookup to return a valid torrent (so favorites are allowed)
    mockGetTorrentByInfohash.mockResolvedValue({ id: 'torrent-1' });
    mockGetTorrentById.mockResolvedValue(null);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'POST',
      body: JSON.stringify({ torrentId: 'torrent-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when torrentId is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('torrentId is required');
  });

  it('adds torrent to favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddTorrentFavorite.mockResolvedValue({
      id: 'fav-new',
      user_id: 'user-123',
      torrent_id: 'torrent-1',
      created_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'POST',
      body: JSON.stringify({ torrentId: 'torrent-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.favorite.id).toBe('fav-new');
    expect(mockAddTorrentFavorite).toHaveBeenCalledWith('user-123', 'torrent-1');
  });

  it('returns 409 when torrent already favorited', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddTorrentFavorite.mockRejectedValue(
      new Error('Torrent already in favorites')
    );

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'POST',
      body: JSON.stringify({ torrentId: 'torrent-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('Torrent already in favorites');
  });

  it('returns 500 on service error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddTorrentFavorite.mockRejectedValue(new Error('Database error'));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'POST',
      body: JSON.stringify({ torrentId: 'torrent-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to add torrent favorite');
  });
});

describe('DELETE /api/favorites/torrents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock torrent lookup to return a valid torrent (so favorites are allowed)
    mockGetTorrentByInfohash.mockResolvedValue({ id: 'torrent-1' });
    mockGetTorrentById.mockResolvedValue(null);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'DELETE',
      body: JSON.stringify({ torrentId: 'torrent-1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when torrentId is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('torrentId is required');
  });

  it('removes torrent from favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockRemoveTorrentFavorite.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'DELETE',
      body: JSON.stringify({ torrentId: 'torrent-1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRemoveTorrentFavorite).toHaveBeenCalledWith(
      'user-123',
      'torrent-1'
    );
  });

  it('returns 500 on service error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockRemoveTorrentFavorite.mockRejectedValue(new Error('Database error'));

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/favorites/torrents', {
      method: 'DELETE',
      body: JSON.stringify({ torrentId: 'torrent-1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to remove torrent favorite');
  });
});
