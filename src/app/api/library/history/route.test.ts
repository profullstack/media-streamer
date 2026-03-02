/**
 * Library History API Route Tests
 *
 * Tests for GET, DELETE /api/library/history
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module
const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock the library repository
const mockGetCombinedHistory = vi.fn();
const mockClearAllHistory = vi.fn();

vi.mock('@/lib/library', () => ({
  getLibraryRepository: () => ({
    getCombinedHistory: mockGetCombinedHistory,
    clearAllHistory: mockClearAllHistory,
  }),
}));

// Mock profiles
vi.mock('@/lib/profiles', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-123'),
}));


describe('GET /api/library/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/history');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('returns combined history when authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetCombinedHistory.mockResolvedValue([
      {
        id: 'wp-1',
        type: 'watch',
        file_id: 'file-1',
        percentage: 50,
        last_activity_at: '2024-01-15T12:00:00Z',
        file: {
          id: 'file-1',
          name: 'Movie.mp4',
          media_category: 'video',
        },
        current_time_seconds: 3600,
        duration_seconds: 7200,
      },
      {
        id: 'rp-1',
        type: 'reading',
        file_id: 'file-2',
        percentage: 25,
        last_activity_at: '2024-01-15T10:00:00Z',
        file: {
          id: 'file-2',
          name: 'Book.epub',
          media_category: 'ebook',
        },
        current_page: 50,
        total_pages: 200,
      },
    ]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/history');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.history).toHaveLength(2);
    expect(data.history[0].type).toBe('watch');
    expect(data.history[1].type).toBe('reading');
  });

  it('returns empty array when user has no history', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetCombinedHistory.mockResolvedValue([]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/history');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.history).toEqual([]);
  });

  it('respects limit query parameter', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetCombinedHistory.mockResolvedValue([]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/history?limit=10');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetCombinedHistory).toHaveBeenCalledWith('profile-123', 10);
  });

  it('uses default limit of 50', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetCombinedHistory.mockResolvedValue([]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/history');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetCombinedHistory).toHaveBeenCalledWith('profile-123', 50);
  });

  it('returns 500 on repository error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockGetCombinedHistory.mockRejectedValue(new Error('Database error'));

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/library/history');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch history');
  });
});

describe('DELETE /api/library/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { DELETE } = await import('./route');
    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('clears all history', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockClearAllHistory.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockClearAllHistory).toHaveBeenCalledWith('profile-123');
  });

  it('returns 500 on repository error', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' });
    mockClearAllHistory.mockRejectedValue(new Error('Database error'));

    const { DELETE } = await import('./route');
    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to clear history');
  });
});
