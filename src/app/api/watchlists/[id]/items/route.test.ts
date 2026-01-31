/**
 * Watchlist Items API Route Tests
 *
 * Tests for POST and DELETE /api/watchlists/:id/items
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from './route';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock watchlist repository
const mockGetUserWatchlists = vi.fn();
const mockAddItem = vi.fn();
const mockRemoveItem = vi.fn();

vi.mock('@/lib/watchlist', () => ({
  getWatchlistRepository: vi.fn(() => ({
    getUserWatchlists: mockGetUserWatchlists,
    addItem: mockAddItem,
    removeItem: mockRemoveItem,
  })),
}));

import { getAuthenticatedUser } from '@/lib/auth';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

const validItemBody = {
  tmdbId: 123,
  mediaType: 'movie',
  title: 'Test Movie',
  posterPath: '/poster.jpg',
  overview: 'A test movie',
  releaseDate: '2026-06-01',
  voteAverage: 7.5,
  genres: ['Action'],
  castNames: ['Actor 1'],
  directors: ['Director 1'],
};

describe('Watchlist Items API - /api/watchlists/:id/items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/watchlists/:id/items', () => {
    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify(validItemBody),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(401);
    });

    it('should return 400 when tmdbId is missing', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify({ mediaType: 'movie', title: 'Test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('tmdbId');
    });

    it('should return 400 when mediaType is missing', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify({ tmdbId: 123, title: 'Test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
    });

    it('should return 400 when title is missing', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify({ tmdbId: 123, mediaType: 'movie' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid mediaType', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify({ tmdbId: 123, mediaType: 'anime', title: 'Test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('mediaType');
    });

    it('should return 404 when watchlist not found (not owned by user)', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockGetUserWatchlists.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify(validItemBody),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(404);
    });

    it('should add item and return 201', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      mockGetUserWatchlists.mockResolvedValueOnce([
        { id: 'wl-1', name: 'My Watchlist', user_id: 'user-123' },
      ]);

      const mockItem = {
        id: 'item-new',
        watchlist_id: 'wl-1',
        tmdb_id: 123,
        media_type: 'movie',
        title: 'Test Movie',
        position: 0,
      };
      mockAddItem.mockResolvedValueOnce(mockItem);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify(validItemBody),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.item.title).toBe('Test Movie');
    });

    it('should return 409 for duplicate item', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      mockGetUserWatchlists.mockResolvedValueOnce([
        { id: 'wl-1', name: 'My Watchlist', user_id: 'user-123' },
      ]);

      mockAddItem.mockRejectedValueOnce(new Error('Item already in watchlist'));

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify(validItemBody),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain('already in watchlist');
    });

    it('should return 500 on generic error', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      mockGetUserWatchlists.mockResolvedValueOnce([
        { id: 'wl-1', name: 'My Watchlist', user_id: 'user-123' },
      ]);

      mockAddItem.mockRejectedValueOnce(new Error('Connection failed'));

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'POST',
        body: JSON.stringify(validItemBody),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, makeParams('wl-1'));

      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /api/watchlists/:id/items', () => {
    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'DELETE',
        body: JSON.stringify({ tmdbId: 123, mediaType: 'movie' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(401);
    });

    it('should return 400 when tmdbId is missing', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'DELETE',
        body: JSON.stringify({ mediaType: 'movie' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
    });

    it('should return 400 when mediaType is missing', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'DELETE',
        body: JSON.stringify({ tmdbId: 123 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid mediaType', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'DELETE',
        body: JSON.stringify({ tmdbId: 123, mediaType: 'anime' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
    });

    it('should return 404 when watchlist not found', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockGetUserWatchlists.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/watchlists/wl-missing/items', {
        method: 'DELETE',
        body: JSON.stringify({ tmdbId: 123, mediaType: 'movie' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, makeParams('wl-missing'));

      expect(response.status).toBe(404);
    });

    it('should remove item and return success', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      mockGetUserWatchlists.mockResolvedValueOnce([
        { id: 'wl-1', name: 'My Watchlist', user_id: 'user-123' },
      ]);
      mockRemoveItem.mockResolvedValueOnce(undefined);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'DELETE',
        body: JSON.stringify({ tmdbId: 123, mediaType: 'movie' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(mockRemoveItem).toHaveBeenCalledWith('wl-1', 123, 'movie');
    });

    it('should return 500 on repository error', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      mockGetUserWatchlists.mockResolvedValueOnce([
        { id: 'wl-1', name: 'My Watchlist', user_id: 'user-123' },
      ]);
      mockRemoveItem.mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watchlists/wl-1/items', {
        method: 'DELETE',
        body: JSON.stringify({ tmdbId: 123, mediaType: 'movie' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(500);
    });
  });
});
