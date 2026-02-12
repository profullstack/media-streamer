/**
 * Middleware Tests
 *
 * Tests for auth token refresh middleware, particularly:
 * - Cookie preservation on transient failures
 * - Cookie clearing only on 401
 * - Circuit breaker behavior
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock fetch globally
const mockFetch = vi.fn();
const originalFetch = global.fetch;

// Set env before import
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

/**
 * Create a valid JWT with a specific expiry
 */
function createJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp, sub: 'user-123' })).toString('base64url');
  const signature = Buffer.from('fake-signature').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function createRequestWithToken(accessToken: string, refreshToken: string): NextRequest {
  const cookieValue = JSON.stringify({ access_token: accessToken, refresh_token: refreshToken });
  return new NextRequest('http://localhost:3000/live-tv', {
    headers: { cookie: `sb-auth-token=${encodeURIComponent(cookieValue)}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('Middleware - Token Refresh', () => {
  it('should pass through when no auth cookie', async () => {
    const { middleware } = await import('./middleware');
    const request = new NextRequest('http://localhost:3000/live-tv');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('should not refresh when token is still fresh (>60s to expiry)', async () => {
    const { middleware } = await import('./middleware');
    const freshToken = createJwt(Math.floor(Date.now() / 1000) + 3600); // expires in 1 hour
    const request = createRequestWithToken(freshToken, 'refresh-token');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    // No fetch call should be made for refresh
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should refresh and update cookie when token is about to expire', async () => {
    const { middleware } = await import('./middleware');
    const expiringToken = createJwt(Math.floor(Date.now() / 1000) + 30); // expires in 30s

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
      }),
    });

    const request = createRequestWithToken(expiringToken, 'old-refresh');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('new-access-token');
    expect(setCookie).toContain('new-refresh-token');
  });

  it('should NOT clear cookie on transient refresh failure (500)', async () => {
    const { middleware } = await import('./middleware');
    const expiredToken = createJwt(Math.floor(Date.now() / 1000) - 60); // expired 1 min ago

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server error' }),
    });

    const request = createRequestWithToken(expiredToken, 'refresh-token');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    // Cookie should NOT be cleared on 500
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) {
      expect(setCookie).not.toContain('Max-Age=0');
    }
  });

  it('should NOT clear cookie on refresh timeout', async () => {
    const { middleware } = await import('./middleware');
    const expiredToken = createJwt(Math.floor(Date.now() / 1000) - 60);

    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

    const request = createRequestWithToken(expiredToken, 'refresh-token');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    // Cookie should NOT be cleared on timeout
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) {
      expect(setCookie).not.toContain('Max-Age=0');
    }
  });

  it('should clear cookie on 401 (token truly revoked)', async () => {
    const { middleware } = await import('./middleware');
    const expiredToken = createJwt(Math.floor(Date.now() / 1000) - 60);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const request = createRequestWithToken(expiredToken, 'revoked-refresh');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('Max-Age=0');
  });
});

describe('Middleware - Circuit Breaker', () => {
  it('should skip refresh after multiple consecutive failures', async () => {
    const { middleware } = await import('./middleware');
    const expiredToken = createJwt(Math.floor(Date.now() / 1000) - 60);

    // Fail 3 times to trip the circuit breaker
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server error' }),
    });

    for (let i = 0; i < 3; i++) {
      await middleware(createRequestWithToken(expiredToken, 'refresh'));
    }

    // Reset mock call count
    mockFetch.mockClear();

    // 4th request should skip fetch (circuit open)
    await middleware(createRequestWithToken(expiredToken, 'refresh'));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
