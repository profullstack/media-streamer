/**
 * Library Favorites API Route Tests
 *
 * Tests for GET, POST, DELETE /api/library/favorites
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module
const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock the library repository
const mockGetUserFavorites = vi.fn();
const mockAddFavorite = vi.fn();
const mockRemoveFavorite = vi.fn();
const mockIsFavorite = vi.fn();

vi.mock('@/lib/library', () => ({
  getLibraryRepository: () => ({
    getUserFavorites: mockGetUserFavorites,
    addFavorite: mockAddFavorite,
    removeFavorite: mockRemoveFavorite,
    isFavorite: mockIsFavorite,
  }),
}));

describe('GET /api/library/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns user favorites when authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetUserFavorites.mockResolvedValue([
      {
        id: 'fav-1',
        user_id: 'user-123',
        file_id: 'file-1',
        created_at: '2024-01-15T00:00:00Z',
        torrent_files: {
          id: 'file-1',
          name: 'Test.mp3',
          media_category: 'audio',
        },
      },
    ]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toHaveLength(1);
    expect(data.favorites[0].id).toBe('fav-1');
  });

  it('returns empty array when user has no favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetUserFavorites.mockResolvedValue([]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toEqual([]);
  });

  it('returns 500 on repository error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetUserFavorites.mockRejectedValue(new Error('Database error'));

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch favorites');
  });

  it('returns isFavorited true when file is favorited', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockIsFavorite.mockResolvedValue(true);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites?fileId=file-1');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isFavorited).toBe(true);
    expect(mockIsFavorite).toHaveBeenCalledWith('user-123', 'file-1');
  });

  it('returns isFavorited false when file is not favorited', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockIsFavorite.mockResolvedValue(false);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites?fileId=file-2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isFavorited).toBe(false);
    expect(mockIsFavorite).toHaveBeenCalledWith('user-123', 'file-2');
  });
});

describe('POST /api/library/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'POST',
      body: JSON.stringify({ fileId: 'file-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when fileId is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('fileId is required');
  });

  it('adds file to favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddFavorite.mockResolvedValue({
      id: 'fav-new',
      user_id: 'user-123',
      file_id: 'file-1',
      created_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'POST',
      body: JSON.stringify({ fileId: 'file-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.favorite.id).toBe('fav-new');
    expect(mockAddFavorite).toHaveBeenCalledWith('user-123', 'file-1');
  });

  it('returns 409 when file already favorited', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockAddFavorite.mockRejectedValue(new Error('File already in favorites'));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'POST',
      body: JSON.stringify({ fileId: 'file-1' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('File already in favorites');
  });
});

describe('DELETE /api/library/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ fileId: 'file-1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when fileId is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('fileId is required');
  });

  it('removes file from favorites', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockRemoveFavorite.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ fileId: 'file-1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRemoveFavorite).toHaveBeenCalledWith('user-123', 'file-1');
  });

  it('returns 500 on repository error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockRemoveFavorite.mockRejectedValue(new Error('Database error'));

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/library/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ fileId: 'file-1' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to remove favorite');
  });
});
