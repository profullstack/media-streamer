/**
 * Radio Favorites API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase auth
const mockGetUser = vi.fn();
const mockSetSession = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: {
      setSession: mockSetSession,
      getUser: mockGetUser,
    },
  }),
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

function createRequest(
  url: string,
  options: { method?: string; body?: string; headers?: HeadersInit; authenticated?: boolean } = {}
): NextRequest {
  const { authenticated = false, method, body, headers: optHeaders } = options;
  const headers = new Headers(optHeaders);

  if (authenticated) {
    headers.set('Cookie', 'sb-auth-token=' + encodeURIComponent(JSON.stringify({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
    })));
  }

  return new NextRequest(url, { method, body, headers });
}

describe('GET /api/radio/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns user favorites when authenticated', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockGetUserFavorites.mockResolvedValue([
      {
        id: 'fav-1',
        user_id: 'user-123',
        station_id: 's123',
        station_name: 'NPR News',
        created_at: '2024-01-15T00:00:00Z',
      },
    ]);

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', { authenticated: true });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.favorites).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(mockGetUserFavorites).toHaveBeenCalledWith('user-123');
  });

  it('checks if station is favorited when stationId provided', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockIsFavorite.mockResolvedValue(true);

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites?stationId=s123', { authenticated: true });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isFavorited).toBe(true);
    expect(mockIsFavorite).toHaveBeenCalledWith('user-123', 's123');
  });

  it('returns 500 on service error', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockGetUserFavorites.mockRejectedValue(new Error('Database error'));

    const { GET } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', { authenticated: true });
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
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

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
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    const { POST } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'POST',
      body: JSON.stringify({ stationName: 'Test' }),
      authenticated: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('stationId');
  });

  it('adds station to favorites', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockAddToFavorites.mockResolvedValue({
      id: 'fav-new',
      user_id: 'user-123',
      station_id: 's123',
      station_name: 'NPR News',
      created_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'POST',
      body: JSON.stringify(validInput),
      authenticated: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.favorite.id).toBe('fav-new');
    expect(mockAddToFavorites).toHaveBeenCalledWith('user-123', {
      id: 's123',
      name: 'NPR News',
      imageUrl: 'https://example.com/npr.png',
      genre: 'News',
    });
  });

  it('returns 500 on service error', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockAddToFavorites.mockRejectedValue(new Error('Database error'));

    const { POST } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'POST',
      body: JSON.stringify(validInput),
      authenticated: true,
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
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

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
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    const { DELETE } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'DELETE',
      body: JSON.stringify({}),
      authenticated: true,
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('stationId');
  });

  it('removes station from favorites', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockRemoveFromFavorites.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ stationId: 's123' }),
      authenticated: true,
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRemoveFromFavorites).toHaveBeenCalledWith('user-123', 's123');
  });

  it('returns 500 on service error', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockRemoveFromFavorites.mockRejectedValue(new Error('Database error'));

    const { DELETE } = await import('./route');
    const request = createRequest('http://localhost/api/radio/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ stationId: 's123' }),
      authenticated: true,
    });
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to remove favorite');
  });
});
