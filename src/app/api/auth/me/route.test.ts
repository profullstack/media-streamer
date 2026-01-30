/**
 * Auth Me API Route Tests
 *
 * Tests for /api/auth/me endpoint with cookie-based sessions
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase client - MUST be at top level for hoisting
const mockSetSession = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: {
      setSession: mockSetSession,
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}));

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('unauthenticated', () => {
    it('should return null user when no cookie', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost:3000/api/auth/me');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toBeNull();
    });

    it('should return null user when cookie is invalid JSON', async () => {
      const { GET } = await import('./route');
      // Don't encode - NextRequest will decode automatically
      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        headers: {
          cookie: 'sb-auth-token=invalid-json',
        },
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toBeNull();
    });

    it('should return null user when session is invalid', async () => {
      mockSetSession.mockResolvedValueOnce({
        error: { message: 'Invalid session' },
      });

      const { GET } = await import('./route');
      // Use JSON string directly - NextRequest decodes automatically
      const cookieValue = JSON.stringify({
        access_token: 'invalid-token',
        refresh_token: 'invalid-refresh',
      });
      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        headers: {
          cookie: `sb-auth-token=${encodeURIComponent(cookieValue)}`,
        },
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toBeNull();
      // Should clear invalid cookie
      expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
  });

  describe('authenticated', () => {
    it('should return user data when authenticated with valid session', async () => {
      // Set up mocks BEFORE importing the route
      mockSetSession.mockResolvedValueOnce({ error: null });
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: {
              display_name: 'Test User',
              avatar_url: 'https://example.com/avatar.jpg',
            },
          },
        },
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            single: vi.fn().mockResolvedValueOnce({
              data: { tier: 'premium', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const { GET } = await import('./route');
      const cookieValue = JSON.stringify({
        access_token: 'valid-token',
        refresh_token: 'valid-refresh',
      });
      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        headers: {
          cookie: `sb-auth-token=${encodeURIComponent(cookieValue)}`,
        },
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'premium',
        subscription_status: 'active',
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      });
    });

    it('should return trial tier when no subscription found', async () => {
      mockSetSession.mockResolvedValueOnce({ error: null });
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: {},
          },
        },
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            single: vi.fn().mockResolvedValueOnce({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });

      const { GET } = await import('./route');
      const cookieValue = JSON.stringify({
        access_token: 'valid-token',
        refresh_token: 'valid-refresh',
      });
      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        headers: {
          cookie: `sb-auth-token=${encodeURIComponent(cookieValue)}`,
        },
      });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.subscription_tier).toBe('trial');
      expect(data.user.subscription_status).toBe('active');
    });
  });

  describe('caching', () => {
    it('should set cache-control headers', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost:3000/api/auth/me');
      const response = await GET(request);

      expect(response.headers.get('Cache-Control')).toBe(
        'private, max-age=30, stale-while-revalidate=300'
      );
    });
  });
});
