/**
 * Library Collections API Route Tests
 *
 * Tests for GET, POST /api/library/collections
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module
const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock the library repository
const mockGetUserCollections = vi.fn();
const mockCreateCollection = vi.fn();
const mockDeleteCollection = vi.fn();

vi.mock('@/lib/library', () => ({
  getLibraryRepository: () => ({
    getUserCollections: mockGetUserCollections,
    createCollection: mockCreateCollection,
    deleteCollection: mockDeleteCollection,
  }),
}));

// Mock profiles
vi.mock('@/lib/profiles', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-123'),
}));


describe('GET /api/library/collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns user collections when authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetUserCollections.mockResolvedValue([
      {
        id: 'col-1',
        user_id: 'user-123',
        name: 'My Playlist',
        collection_type: 'playlist',
        item_count: 5,
        created_at: '2024-01-15T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      },
    ]);

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0].name).toBe('My Playlist');
  });

  it('returns empty array when user has no collections', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetUserCollections.mockResolvedValue([]);

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.collections).toEqual([]);
  });

  it('returns 500 on repository error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetUserCollections.mockRejectedValue(new Error('Database error'));

    const { GET } = await import('./route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch collections');
  });
});

describe('POST /api/library/collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Playlist', type: 'playlist' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when name is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({ type: 'playlist' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('name is required');
  });

  it('returns 400 when type is invalid', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', type: 'invalid' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid collection type');
  });

  it('creates a new collection', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockCreateCollection.mockResolvedValue({
      id: 'col-new',
      user_id: 'user-123',
      name: 'New Playlist',
      collection_type: 'playlist',
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Playlist', type: 'playlist' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.collection.name).toBe('New Playlist');
    expect(mockCreateCollection).toHaveBeenCalledWith(
      'profile-123',
      'New Playlist',
      'playlist'
    );
  });

  it('defaults to mixed type when not specified', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockCreateCollection.mockResolvedValue({
      id: 'col-new',
      user_id: 'user-123',
      name: 'New Collection',
      collection_type: 'mixed',
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
    });

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/library/collections', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Collection' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockCreateCollection).toHaveBeenCalledWith(
      'profile-123',
      'New Collection',
      'mixed'
    );
  });
});
