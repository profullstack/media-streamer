/**
 * Login API Route Tests
 *
 * Tests for user authentication with Supabase Auth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase client
const mockSignInWithPassword = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
    from: mockFrom,
  }),
}));

describe('Login API - POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Input Validation', () => {
    it('should return 400 when email is missing', async () => {
      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password: 'Password123!' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.toLowerCase()).toContain('email');
    });

    it('should return 400 when password is missing', async () => {
      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.toLowerCase()).toContain('password');
    });

    it('should return 400 for invalid email format', async () => {
      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'not-an-email', password: 'Password123!' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.toLowerCase()).toContain('email');
    });
  });

  describe('Successful Login', () => {
    it('should return user and session on successful login', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2024-01-01T00:00:00Z',
            user_metadata: { display_name: 'Test User' },
          },
          session: {
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_at: Date.now() / 1000 + 3600,
          },
        },
        error: null,
      });

      // Mock subscription lookup
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

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('test@example.com');
      expect(data.session).toBeDefined();
    });

    it('should set auth cookie on successful login', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2024-01-01T00:00:00Z',
          },
          session: {
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_at: Date.now() / 1000 + 3600,
          },
        },
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            single: vi.fn().mockResolvedValueOnce({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      // Check for Set-Cookie header
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('sb-auth-token');
    });
  });

  describe('Error Handling', () => {
    it('should return 401 for invalid credentials', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: {
          message: 'Invalid login credentials',
          status: 400,
        },
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'WrongPassword!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.toLowerCase()).toContain('invalid');
    });

    it('should return 401 for unconfirmed email', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: {
          message: 'Email not confirmed',
          status: 400,
        },
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'unconfirmed@example.com',
          password: 'Password123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.toLowerCase()).toContain('email');
    });

    it('should return 400 for invalid JSON body', async () => {
      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});
