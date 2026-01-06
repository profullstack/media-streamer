/**
 * Signup API Route Tests
 *
 * Tests for user registration with Supabase Auth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase client
const mockSignUp = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: {
      signUp: mockSignUp,
    },
    from: mockFrom,
  }),
}));

describe('Signup API - POST /api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Input Validation', () => {
    it('should return 400 when email is missing', async () => {
      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
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
      const request = new NextRequest('http://localhost/api/auth/signup', {
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
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email: 'not-an-email', password: 'Password123!' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.toLowerCase()).toContain('email');
    });

    it('should return 400 when password is too short', async () => {
      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'short' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.toLowerCase()).toContain('password');
    });
  });

  describe('Successful Signup', () => {
    it('should create user and return success with email confirmation required', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: null,
          },
          session: null, // No session until email confirmed
        },
        error: null,
      });

      // Mock subscription creation (upsert)
      mockFrom.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.message).toContain('confirmation');
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('test@example.com');
    });

    it('should call Supabase signUp with correct parameters', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'user-123', email: 'test@example.com' },
          session: null,
        },
        error: null,
      });

      // Mock subscription creation (upsert)
      mockFrom.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
        options: expect.objectContaining({
          emailRedirectTo: expect.any(String),
        }),
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 409 when email already exists', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: {
          message: 'User already registered',
          status: 400,
        },
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'Password123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain('already');
    });

    it('should return 500 for unexpected Supabase errors', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: {
          message: 'Database connection failed',
          status: 500,
        },
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });

    it('should return 400 for invalid JSON body', async () => {
      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});
