/**
 * IPTV Playlists API Route Tests
 *
 * Tests for GET and POST /api/iptv/playlists endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

// Mock undici fetch (used for M3U URL validation with SSL bypass)
// Use vi.hoisted to ensure the mock function is available when vi.mock is hoisted
const { mockUndici } = vi.hoisted(() => ({
  mockUndici: vi.fn(),
}));

vi.mock('undici', () => ({
  Agent: vi.fn().mockImplementation(() => ({})),
  fetch: mockUndici,
}));

// Mock Supabase
const mockSupabaseSelect = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseFrom = vi.fn();
const mockSupabaseGetUser = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
    auth: {
      getUser: mockSupabaseGetUser,
    },
  }),
}));

describe('IPTV Playlists API', () => {
  const mockUserId = 'user-123-uuid';
  const mockAccessToken = 'mock-access-token';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default: authenticated user
    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/iptv/playlists', () => {
    it('should return 401 when not authenticated', async () => {
      mockSupabaseGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return playlists for authenticated user', async () => {
      const mockPlaylists = [
        {
          id: 'playlist-1',
          user_id: mockUserId,
          name: 'My Playlist',
          m3u_url: 'http://example.com/playlist.m3u',
          epg_url: null,
          is_active: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockPlaylists,
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.playlists).toHaveLength(1);
      expect(data.playlists[0].name).toBe('My Playlist');
      expect(data.playlists[0].m3uUrl).toBe('http://example.com/playlist.m3u');
    });

    it('should return 500 on database error', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' },
            }),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch playlists');
    });
  });

  describe('POST /api/iptv/playlists', () => {
    beforeEach(() => {
      // Default: successful M3U URL validation (using undici fetch with SSL bypass)
      mockUndici.mockResolvedValue({
        ok: true,
        status: 200,
      });

      // Default: successful database insert
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'new-playlist-id',
                user_id: mockUserId,
                name: 'My Playlist',
                m3u_url: 'http://example.com/playlist.m3u',
                epg_url: null,
                is_active: false,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockSupabaseGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when name is missing', async () => {
      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          m3uUrl: 'http://example.com/playlist.m3u',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: name');
    });

    it('should return 400 when m3uUrl is missing', async () => {
      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required field: m3uUrl');
    });

    it('should return 400 when m3uUrl is invalid', async () => {
      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'not-a-valid-url',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid m3uUrl: must be a valid HTTP or HTTPS URL');
    });

    it('should return 400 when epgUrl is provided but invalid', async () => {
      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
          epgUrl: 'not-a-valid-url',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid epgUrl: must be a valid HTTP or HTTPS URL');
    });

    it('should return 502 when M3U URL is not accessible', async () => {
      mockUndici.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.error).toBe('Failed to validate M3U URL: 404 Not Found');
    });

    it('should return 504 when M3U URL request times out', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockUndici.mockRejectedValueOnce(abortError);

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(504);
      expect(data.error).toBe('Request timeout while validating M3U URL');
    });

    // Note: SSL certificate error tests removed because we now use undici with
    // rejectUnauthorized: false to bypass SSL certificate validation.
    // This is intentional to support IPTV providers with misconfigured certificates.

    it('should return 200 with playlist data on success', async () => {
      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('My Playlist');
      expect(data.m3uUrl).toBe('http://example.com/playlist.m3u');
      expect(data.id).toBeDefined();
    });

    it('should return 200 with playlist data including epgUrl on success', async () => {
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'new-playlist-id',
                user_id: mockUserId,
                name: 'My Playlist',
                m3u_url: 'http://example.com/playlist.m3u',
                epg_url: 'http://example.com/epg.xml',
                is_active: false,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
          epgUrl: 'http://example.com/epg.xml',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('My Playlist');
      expect(data.m3uUrl).toBe('http://example.com/playlist.m3u');
      expect(data.epgUrl).toBe('http://example.com/epg.xml');
    });

    it('should return 500 on database insert error', async () => {
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' },
            }),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create playlist');
    });

    it('should return 400 when request body is invalid JSON', async () => {
      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: 'not valid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
    });

    it('should accept 206 Partial Content response from M3U server', async () => {
      mockUndici.mockResolvedValueOnce({
        ok: false, // 206 is not considered "ok" by fetch
        status: 206,
      });

      const request = new NextRequest('http://localhost/api/iptv/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockAccessToken}`,
        },
        body: JSON.stringify({
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('My Playlist');
    });
  });
});
