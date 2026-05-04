/**
 * Radio Favorites API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth
const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock the radio service
const mockGetUserFavorites = vi.fn();
const mockAddToFavorites = vi.fn();
const mockRemoveFromFavorites = vi.fn();
const mockIsFavorite = vi.fn();

vi.mock('@/lib/radio', () => ({
  getRadioService: () => ({
    getUserFavorites: mockGetUserFavorites,
    addToFavorites: mockAddToFavorites,
    removeFromFavorites: mockRemoveFromFavorites,
    isFavorite: mockIsFavorite,
  }),
}));

// Mock profiles
vi.mock('@/lib/profiles', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-123'),
}));

function createRequest(
  url: string,
  options: { method?: string; body?: string; headers?: HeadersInit } = {}
): NextRequest {
  const { method, body, headers: optHeaders } = options;
  return new NextRequest(url, { method, body, headers: optHeaders });
}

function mockAuthenticated(): void {
  mockGetCurrentUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
}

function mockUnauthenticated(): void {
  mockGetCurrentUser.mockResolvedValue(null);
}

describe('GET /api/radio/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns user favorites when authenticated', async () => {
    mockAuthenticated();
    mockGetUserFavorites.mockResolvedValue([
      {
        id: 'fav-1',
        profile_id: 'profile-123',
        station_id: 's123',
        station_name: 'NPR News',
        created_at: '2024-01-15T00:00:00Z',
      },
    ]);

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(mockGetUserFavorites).toHaveBeenCalledWith('profile-123');
  });

  it('checks if station is favorited when stationId provided', async () => {
    mockAuthenticated();
    mockIsFavorite.mockResolvedValue(true);

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites?stationId=s123');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isFavorited).toBe(true);
    expect(mockIsFavorite).toHaveBeenCalledWith('profile-123', 's123');
  });

  it('returns 500 on service error', async () => {
    mockAuthenticated();
    mockGetUserFavorites.mockRejectedValue(new Error('Database error'));

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to get favorites');
  });
});

describe('POST /api/radio/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    stationId: 's123',
    stationName: 'NPR News',
    stationImageUrl: 'https://example.com/npr.png',
    stationGenre: 'News',
  };

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { POST } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'POST',
      body: JSON.stringify(validInput),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when stationId is missing', async () => {
    mockAuthenticated();

    const { POST } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'POST',
      body: JSON.stringify({ stationName: 'Test' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('stationId');
  });

  it('adds station to favorites', async () => {
    mockAuthenticated();
    mockAddToFavorites.mockResolvedValue({
      id: 'fav-new',
      profile_id: 'profile-123',
      station_id: 's123',
      station_name: 'NPR News',
      created_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'POST',
      body: JSON.stringify(validInput),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.favorite.id).toBe('fav-new');
    expect(mockAddToFavorites).toHaveBeenCalledWith('profile-123', {
      id: 's123',
      name: 'NPR News',
      imageUrl: 'https://example.com/npr.png',
      genre: 'News',
    });
  });

  it('returns 500 on service error', async () => {
    mockAuthenticated();
    mockAddToFavorites.mockRejectedValue(new Error('Database error'));

    const { POST } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'POST',
      body: JSON.stringify(validInput),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to add favorite');
  });
});

describe('DELETE /api/radio/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { DELETE } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ stationId: 's123' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when stationId is missing', async () => {
    mockAuthenticated();

    const { DELETE } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('stationId');
  });

  it('removes station from favorites', async () => {
    mockAuthenticated();
    mockRemoveFromFavorites.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ stationId: 's123' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRemoveFromFavorites).toHaveBeenCalledWith('profile-123', 's123');
  });

  it('returns 500 on service error', async () => {
    mockAuthenticated();
    mockRemoveFromFavorites.mockRejectedValue(new Error('Database error'));

    const { DELETE } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ stationId: 's123' }),
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to remove favorite');
  });
});
