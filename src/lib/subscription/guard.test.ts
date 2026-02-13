import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock isSubscriptionActive
const mockIsSubscriptionActive = vi.fn();
vi.mock('./check', () => ({
  isSubscriptionActive: (...args: unknown[]) => mockIsSubscriptionActive(...args),
}));

// Mock supabase
const mockGetUser = vi.fn();
const mockSetSession = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      getUser: () => mockGetUser(),
    },
  }),
}));

import { requireActiveSubscription } from './guard';

function makeRequest(cookie?: string) {
  const url = 'http://localhost/api/stream?infohash=abc';
  const req = new NextRequest(url);
  if (cookie) {
    // NextRequest cookies are read-only, so we construct with headers
    return new NextRequest(url, {
      headers: { Cookie: `sb-auth-token=${encodeURIComponent(cookie)}` },
    });
  }
  return req;
}

describe('requireActiveSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no auth cookie', async () => {
    const result = await requireActiveSubscription(makeRequest());
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(result!.status).toBe(401);
    expect(body.error).toBe('unauthorized');
  });

  it('returns null (allow) for active subscription', async () => {
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockIsSubscriptionActive.mockResolvedValue({ active: true, tier: 'premium', expired: false, trialExpired: false });

    const cookie = JSON.stringify({ access_token: 'at', refresh_token: 'rt' });
    const result = await requireActiveSubscription(makeRequest(cookie));
    expect(result).toBeNull();
  });

  it('returns 403 for expired subscription', async () => {
    mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockIsSubscriptionActive.mockResolvedValue({ active: false, tier: 'trial', expired: true, trialExpired: true });

    const cookie = JSON.stringify({ access_token: 'at', refresh_token: 'rt' });
    const result = await requireActiveSubscription(makeRequest(cookie));
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(result!.status).toBe(403);
    expect(body.error).toBe('subscription_expired');
  });
});
