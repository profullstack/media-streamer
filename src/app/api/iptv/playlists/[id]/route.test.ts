/**
 * IPTV Playlist Individual Route Tests
 *
 * Tests for GET, PUT, DELETE /api/iptv/playlists/[id]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT, DELETE } from './route';

// Mock undici fetch (used for M3U URL validation with SSL bypass)
// Use vi.hoisted to ensure the mock function is available when vi.mock is hoisted
const { mockUndici } = vi.hoisted(() => ({
  mockUndici: vi.fn(),
}));

vi.mock('undici', () => ({
  Agent: vi.fn().mockImplementation(() => ({})),
  fetch: mockUndici,
}));

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    setSession: vi.fn(),
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => mockSupabaseClient,
}));

describe('IPTV Playlist Individual API', () => {
  const mockUserId = 'user-123';
  const mockPlaylistId = 'playlist-456';
  const mockPlaylist = {
    id: mockPlaylistId,
    user_id: mockUserId,
    name: 'Test Playlist',
    m3u_url: 'http://example.com/playlist.m3u',
    epg_url: null,
    is_active: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default: authenticated user
    mockSupabaseClient.auth.setSession.mockResolvedValue({ error: null });
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: mockUserId } },
      error: null,
    });
  });

  function createRequest(
    method: string,
    playlistId: string,
    body?: Record<string, unknown>,
    authToken?: string
  ): NextRequest {
    const url = `http://localhost:3000/api/iptv/playlists/${playlistId}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe('GET /api/iptv/playlists/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockSupabaseClient.auth.setSession.mockResolvedValue({ error: new Error('No session') });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('No user'),
      });

      const request = createRequest('GET', mockPlaylistId);
      const response = await GET(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('returns 404 when playlist not found', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      });

      const request = createRequest('GET', mockPlaylistId, undefined, 'test-token');
      const response = await GET(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Playlist not found');
    });

    it('returns playlist when found', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockPlaylist,
                error: null,
              }),
            }),
          }),
        }),
      });

      const request = createRequest('GET', mockPlaylistId, undefined, 'test-token');
      const response = await GET(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(mockPlaylistId);
      expect(data.name).toBe('Test Playlist');
      expect(data.m3uUrl).toBe('http://example.com/playlist.m3u');
    });
  });

  describe('PUT /api/iptv/playlists/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockSupabaseClient.auth.setSession.mockResolvedValue({ error: new Error('No session') });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('No user'),
      });

      const request = createRequest('PUT', mockPlaylistId, { name: 'Updated' });
      const response = await PUT(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(401);
    });

    it('returns 400 when body is empty', async () => {
      const request = createRequest('PUT', mockPlaylistId, {}, 'test-token');
      const response = await PUT(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No fields to update');
    });

    it('returns 400 when m3uUrl is invalid', async () => {
      const request = createRequest('PUT', mockPlaylistId, { m3uUrl: 'not-a-url' }, 'test-token');
      const response = await PUT(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid m3uUrl');
    });

    it('returns 404 when playlist not found', async () => {
      mockUndici.mockResolvedValue({ ok: true, status: 200 });
      
      mockSupabaseClient.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116' },
                }),
              }),
            }),
          }),
        }),
      });

      const request = createRequest('PUT', mockPlaylistId, { name: 'Updated' }, 'test-token');
      const response = await PUT(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(404);
    });

    it('updates playlist name successfully', async () => {
      const updatedPlaylist = { ...mockPlaylist, name: 'Updated Playlist' };
      
      mockSupabaseClient.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: updatedPlaylist,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const request = createRequest('PUT', mockPlaylistId, { name: 'Updated Playlist' }, 'test-token');
      const response = await PUT(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('Updated Playlist');
    });

    it('validates new m3uUrl before updating', async () => {
      // Mock undici fetch (used for M3U URL validation with SSL bypass)
      mockUndici.mockResolvedValue({ ok: true, status: 200 });
      
      const updatedPlaylist = { ...mockPlaylist, m3u_url: 'http://new.example.com/playlist.m3u' };
      
      mockSupabaseClient.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: updatedPlaylist,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const request = createRequest('PUT', mockPlaylistId, { m3uUrl: 'http://new.example.com/playlist.m3u' }, 'test-token');
      const response = await PUT(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(200);
      expect(mockUndici).toHaveBeenCalledWith(
        'http://new.example.com/playlist.m3u',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('DELETE /api/iptv/playlists/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockSupabaseClient.auth.setSession.mockResolvedValue({ error: new Error('No session') });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('No user'),
      });

      const request = createRequest('DELETE', mockPlaylistId);
      const response = await DELETE(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(401);
    });

    it('returns 404 when playlist not found', async () => {
      // First call for checking existence
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      });

      const request = createRequest('DELETE', mockPlaylistId, undefined, 'test-token');
      const response = await DELETE(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(404);
    });

    it('deletes playlist successfully', async () => {
      // First call for checking existence
      mockSupabaseClient.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockPlaylist,
                error: null,
              }),
            }),
          }),
        }),
      });

      // Second call for delete
      mockSupabaseClient.from.mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        }),
      });

      const request = createRequest('DELETE', mockPlaylistId, undefined, 'test-token');
      const response = await DELETE(request, { params: Promise.resolve({ id: mockPlaylistId }) });
      
      expect(response.status).toBe(204);
    });
  });
});
