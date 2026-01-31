/**
 * Watchlist API Route Tests - Single Watchlist Operations
 *
 * Tests for GET, PATCH, DELETE /api/watchlists/:id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock watchlist repository
const mockGetUserWatchlists = vi.fn();
const mockGetWatchlistItems = vi.fn();
const mockRenameWatchlist = vi.fn();
const mockDeleteWatchlist = vi.fn();

vi.mock('@/lib/watchlist', () => ({
  getWatchlistRepository: vi.fn(() => ({
    getUserWatchlists: mockGetUserWatchlists,
    getWatchlistItems: mockGetWatchlistItems,
    renameWatchlist: mockRenameWatchlist,
    deleteWatchlist: mockDeleteWatchlist,
  })),
}));

import { getAuthenticatedUser } from '@/lib/auth';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Watchlist API - /api/watchlists/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/watchlists/:id', () => {
    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1');
      const response = await GET(request, makeParams('wl-1'));

      expect(response.status).toBe(401);
    });

    it('should return 404 when watchlist not found', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockGetUserWatchlists.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/watchlists/wl-missing');
      const response = await GET(request, makeParams('wl-missing'));

      expect(response.status).toBe(404);
    });

    it('should return watchlist with items', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      mockGetUserWatchlists.mockResolvedValueOnce([
        { id: 'wl-1', name: 'My Watchlist', user_id: 'user-123' },
      ]);

      const mockItems = [
        { id: 'item-1', tmdb_id: 123, title: 'Test Movie', media_type: 'movie' },
      ];
      mockGetWatchlistItems.mockResolvedValueOnce(mockItems);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1');
      const response = await GET(request, makeParams('wl-1'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.watchlist.name).toBe('My Watchlist');
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe('Test Movie');
    });

    it('should return 500 on repository error', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockGetUserWatchlists.mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watchlists/wl-1');
      const response = await GET(request, makeParams('wl-1'));

      expect(response.status).toBe(500);
    });
  });

  describe('PATCH /api/watchlists/:id', () => {
    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, makeParams('wl-1'));

      expect(response.status).toBe(401);
    });

    it('should return 400 when name is missing', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
    });

    it('should return 400 when name is too long', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'a'.repeat(101) }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, makeParams('wl-1'));

      expect(response.status).toBe(400);
    });

    it('should rename a watchlist', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const renamed = { id: 'wl-1', name: 'Renamed List', user_id: 'user-123' };
      mockRenameWatchlist.mockResolvedValueOnce(renamed);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed List' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, makeParams('wl-1'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.watchlist.name).toBe('Renamed List');
      expect(mockRenameWatchlist).toHaveBeenCalledWith('user-123', 'wl-1', 'Renamed List');
    });

    it('should return 500 on repository error', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockRenameWatchlist.mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, makeParams('wl-1'));

      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /api/watchlists/:id', () => {
    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', { method: 'DELETE' });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(401);
    });

    it('should delete a watchlist', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockDeleteWatchlist.mockResolvedValueOnce(undefined);

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', { method: 'DELETE' });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(mockDeleteWatchlist).toHaveBeenCalledWith('user-123', 'wl-1');
    });

    it('should return 500 on repository error', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockDeleteWatchlist.mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watchlists/wl-1', { method: 'DELETE' });
      const response = await DELETE(request, makeParams('wl-1'));

      expect(response.status).toBe(500);
    });
  });
});
