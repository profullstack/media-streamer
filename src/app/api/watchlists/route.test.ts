/**
 * Watchlist API Route Tests - List & Create
 *
 * Tests for GET and POST /api/watchlists
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock watchlist repository
const mockGetUserWatchlists = vi.fn();
const mockGetOrCreateDefaultWatchlist = vi.fn();
const mockCreateWatchlist = vi.fn();

vi.mock('@/lib/watchlist', () => ({
  getWatchlistRepository: vi.fn(() => ({
    getUserWatchlists: mockGetUserWatchlists,
    getOrCreateDefaultWatchlist: mockGetOrCreateDefaultWatchlist,
    createWatchlist: mockCreateWatchlist,
  })),
}));
// Mock profiles
vi.mock('@/lib/profiles/profile-utils', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-123'),
}));


import { getAuthenticatedUser } from '@/lib/auth';

describe('Watchlist API - /api/watchlists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/watchlists', () => {
    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/watchlists');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('Authentication');
    });

    it('should return existing watchlists', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const mockWatchlists = [
        { id: 'wl-1', name: 'My Watchlist', item_count: 3 },
        { id: 'wl-2', name: 'Action', item_count: 1 },
      ];
      mockGetUserWatchlists.mockResolvedValueOnce(mockWatchlists);

      const request = new NextRequest('http://localhost/api/watchlists');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.watchlists).toHaveLength(2);
      expect(data.watchlists[0].name).toBe('My Watchlist');
    });

    it('should auto-create default watchlist when none exist', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      mockGetUserWatchlists.mockResolvedValueOnce([]);
      mockGetOrCreateDefaultWatchlist.mockResolvedValueOnce({
        id: 'wl-default',
        name: 'My Watchlist',
        item_count: 0,
      });

      const request = new NextRequest('http://localhost/api/watchlists');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.watchlists).toHaveLength(1);
      expect(data.watchlists[0].name).toBe('My Watchlist');
      expect(mockGetOrCreateDefaultWatchlist).toHaveBeenCalledWith('profile-123');
    });

    it('should return 500 on repository error', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockGetUserWatchlists.mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watchlists');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('Failed');
    });
  });

  describe('POST /api/watchlists', () => {
    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name: 'New List' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should return 400 when name is missing', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Name');
    });

    it('should return 400 when name is empty string', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name: '   ' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should return 400 when name is too long', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const request = new NextRequest('http://localhost/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name: 'a'.repeat(101) }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('too long');
    });

    it('should create a watchlist and return 201', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

      const mockWatchlist = {
        id: 'wl-new',
        name: 'Action Movies',
        item_count: 0,
      };
      mockCreateWatchlist.mockResolvedValueOnce(mockWatchlist);

      const request = new NextRequest('http://localhost/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name: 'Action Movies' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.watchlist.name).toBe('Action Movies');
      expect(mockCreateWatchlist).toHaveBeenCalledWith('profile-123', 'Action Movies');
    });

    it('should return 500 on repository error', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
      mockCreateWatchlist.mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });
});
