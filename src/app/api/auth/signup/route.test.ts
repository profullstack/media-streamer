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

const mockIsOpenInvite = vi.fn();

vi.mock('@/lib/invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/invites')>()),
  isOpenInvite: (...args: unknown[]) => mockIsOpenInvite(...args),
}));

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
    mockIsOpenInvite.mockResolvedValue(true);
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

      // Mock IP-based trial check (called first: select → eq → neq)
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      // Mock subscription upsert (called second)
      mockFrom.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!', inviteCode: 'ABCDE-FGHJK'
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

      // Mock IP-based trial check (called first)
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      // Mock subscription upsert (called second)
      mockFrom.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!', inviteCode: 'ABCDE-FGHJK'
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request);

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
        options: expect.objectContaining({
          emailRedirectTo: expect.any(String),
          // The trigger on auth.users reads it from here, normalised.
          data: expect.objectContaining({ invite_code: 'ABCDEFGHJK' }),
        }),
      });
    });
  });

  describe('Trial anti-abuse (signup_ip)', () => {
    // The DB trigger has already inserted a 3-day trial row by the time signUp
    // returns, so the route's upsert must UPDATE that row, not be ignored.
    const FIXED_NOW = new Date('2026-03-01T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function mockSignUpOk(userId: string) {
      mockSignUp.mockResolvedValueOnce({
        data: {
          user: { id: userId, email: 'test@example.com', email_confirmed_at: null },
          session: null,
        },
        error: null,
      });
    }

    function mockIpLookup(rows: Array<{ id: string; user_id: string; status: string; signup_ip: string }>) {
      const neq = vi.fn().mockResolvedValue({ data: rows, error: null });
      const eq = vi.fn().mockReturnValue({ neq });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ eq }),
      });
      return { eq, neq };
    }

    function mockUpsert() {
      const upsert = vi.fn().mockResolvedValueOnce({ error: null });
      mockFrom.mockReturnValueOnce({ upsert });
      return upsert;
    }

    function signupRequest(ip: string) {
      return new NextRequest('http://localhost/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'Password123!', inviteCode: 'ABCDE-FGHJK' }),
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': `${ip}, 10.0.0.1`,
        },
      });
    }

    it('fresh IP: records signup_ip and a 3-day trial, overwriting the trigger row', async () => {
      mockSignUpOk('user-fresh');
      const { eq, neq } = mockIpLookup([]);
      const upsert = mockUpsert();

      const { POST } = await import('./route');
      const response = await POST(signupRequest('203.0.113.7'));
      expect(response.status).toBe(201);

      // Looked up by the first X-Forwarded-For hop, excluding the new user's own row
      expect(eq).toHaveBeenCalledWith('signup_ip', '203.0.113.7');
      expect(neq).toHaveBeenCalledWith('user_id', 'user-fresh');

      expect(upsert).toHaveBeenCalledTimes(1);
      const [payload, options] = upsert.mock.calls[0];
      expect(payload).toEqual({
        user_id: 'user-fresh',
        tier: 'trial',
        status: 'active',
        trial_started_at: '2026-03-01T12:00:00.000Z',
        trial_expires_at: '2026-03-04T12:00:00.000Z',
        signup_ip: '203.0.113.7',
      });
      // Must merge over the trigger's row; ignoreDuplicates would leave signup_ip NULL
      expect(options).toEqual({ onConflict: 'user_id', ignoreDuplicates: false });
    });

    it('repeat IP: records signup_ip and shortens the trial to 1 day', async () => {
      mockSignUpOk('user-repeat');
      mockIpLookup([
        { id: 'sub-1', user_id: 'user-earlier', status: 'active', signup_ip: '203.0.113.7' },
      ]);
      const upsert = mockUpsert();

      const { POST } = await import('./route');
      const response = await POST(signupRequest('203.0.113.7'));
      expect(response.status).toBe(201);

      expect(upsert).toHaveBeenCalledTimes(1);
      const [payload, options] = upsert.mock.calls[0];
      expect(payload).toMatchObject({
        user_id: 'user-repeat',
        tier: 'trial',
        status: 'active',
        trial_started_at: '2026-03-01T12:00:00.000Z',
        trial_expires_at: '2026-03-02T12:00:00.000Z',
        signup_ip: '203.0.113.7',
      });
      expect(options).toEqual({ onConflict: 'user_id', ignoreDuplicates: false });
    });
  });

  describe('Invite only', () => {
    const post = async (body: Record<string, unknown>) => {
      const { POST } = await import('./route');
      return POST(
        new NextRequest('http://localhost/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        })
      );
    };

    it('refuses a signup with no invite code, before touching Supabase', async () => {
      const res = await post({ email: 'test@example.com', password: 'Password123!' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/invite code is required/i);
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('refuses an unknown or used invite code', async () => {
      mockIsOpenInvite.mockResolvedValue(false);
      const res = await post({ email: 'test@example.com', password: 'Password123!', inviteCode: 'ZZZZZ-ZZZZZ' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/invalid, expired or used up/i);
      expect(mockIsOpenInvite).toHaveBeenCalledWith(expect.anything(), 'ZZZZZZZZZZ');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('reports the trigger refusing a code that was used in the meantime', async () => {
      mockSignUp.mockResolvedValue({ data: { user: null }, error: { message: 'Database error saving new user' } });
      const res = await post({ email: 'test@example.com', password: 'Password123!', inviteCode: 'ABCDE-FGHJK' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/invalid, expired or used up/i);
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
          password: 'Password123!', inviteCode: 'ABCDE-FGHJK'
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
          password: 'Password123!', inviteCode: 'ABCDE-FGHJK'
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
