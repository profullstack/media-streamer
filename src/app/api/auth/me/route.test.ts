/**
 * Auth Me API Route Tests
 * 
 * Tests for /api/auth/me endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock cookies
const mockCookies = {
  get: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: () => mockCookies,
}));

// Mock Supabase
const mockSupabaseAuth = {
  getUser: vi.fn(),
};

const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: mockSupabaseAuth,
    from: mockSupabaseFrom,
  }),
}));

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('unauthenticated', () => {
    it('should return null user when no session', async () => {
      mockSupabaseAuth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/me');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toBeNull();
    });

    it('should return null user on auth error', async () => {
      mockSupabaseAuth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = new NextRequest('http://localhost:3000/api/auth/me');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toBeNull();
    });
  });

  describe('authenticated', () => {
    it('should return user data when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      mockSupabaseAuth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            subscription_tier: 'premium',
            display_name: 'Test User',
            avatar_url: 'https://example.com/avatar.jpg',
          },
          error: null,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/auth/me');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'premium',
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      });
    });

    it('should return free tier when no profile found', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      mockSupabaseAuth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/auth/me');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'free',
      });
    });
  });

  describe('caching', () => {
    it('should set cache-control headers', async () => {
      mockSupabaseAuth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/me');
      const response = await GET(request);

      expect(response.headers.get('Cache-Control')).toBe('private, no-cache, no-store, must-revalidate');
    });
  });
});
