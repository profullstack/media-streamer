import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/supabase/client', () => ({
  getServerClient: () => ({ from: mockFrom }),
}));

import { isSubscriptionActive } from './check';

describe('isSubscriptionActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  it('returns inactive when no subscription found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const result = await isSubscriptionActive('user-1');
    expect(result.active).toBe(false);
    expect(result.tier).toBeNull();
  });

  it('returns active for trial not yet expired', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    mockSingle.mockResolvedValue({
      data: { tier: 'trial', status: 'active', trial_expires_at: future, subscription_expires_at: null },
      error: null,
    });
    const result = await isSubscriptionActive('user-1');
    expect(result.active).toBe(true);
    expect(result.tier).toBe('trial');
    expect(result.trialExpired).toBe(false);
  });

  it('returns inactive for expired trial', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    mockSingle.mockResolvedValue({
      data: { tier: 'trial', status: 'active', trial_expires_at: past, subscription_expires_at: null },
      error: null,
    });
    const result = await isSubscriptionActive('user-1');
    expect(result.active).toBe(false);
    expect(result.trialExpired).toBe(true);
    expect(result.expired).toBe(true);
  });

  it('returns active for premium not yet expired', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    mockSingle.mockResolvedValue({
      data: { tier: 'premium', status: 'active', trial_expires_at: null, subscription_expires_at: future },
      error: null,
    });
    const result = await isSubscriptionActive('user-1');
    expect(result.active).toBe(true);
    expect(result.tier).toBe('premium');
  });

  it('returns inactive for expired premium', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    mockSingle.mockResolvedValue({
      data: { tier: 'premium', status: 'active', trial_expires_at: null, subscription_expires_at: past },
      error: null,
    });
    const result = await isSubscriptionActive('user-1');
    expect(result.active).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.trialExpired).toBe(false);
  });
});
