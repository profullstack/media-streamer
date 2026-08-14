import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockRequireActiveSubscription,
  mockGetUserIdFromRequest,
  mockResolveYouTubeAccount,
  mockPlanBulkSubscriptions,
  mockExecuteBulkSubscriptions,
} = vi.hoisted(() => ({
  mockRequireActiveSubscription: vi.fn(),
  mockGetUserIdFromRequest: vi.fn(),
  mockResolveYouTubeAccount: vi.fn(),
  mockPlanBulkSubscriptions: vi.fn(),
  mockExecuteBulkSubscriptions: vi.fn(),
}));

vi.mock('@/lib/subscription/guard', () => ({
  requireActiveSubscription: mockRequireActiveSubscription,
}));

vi.mock('@/lib/youtube/request-auth', () => ({
  getUserIdFromRequest: mockGetUserIdFromRequest,
}));

vi.mock('@/lib/youtube/resolve-account', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/youtube/resolve-account')>('@/lib/youtube/resolve-account');
  return { ...actual, resolveYouTubeAccount: mockResolveYouTubeAccount };
});

vi.mock('@/lib/youtube/bulk', async () => {
  const actual = await vi.importActual<typeof import('@/lib/youtube/bulk')>('@/lib/youtube/bulk');
  return {
    ...actual,
    planBulkSubscriptions: mockPlanBulkSubscriptions,
    executeBulkSubscriptions: mockExecuteBulkSubscriptions,
  };
});

import { POST } from './route';

const manageAccount = {
  id: 'account-1',
  userId: 'user-1',
  googleSub: 'google-sub',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenExpiresAt: '2026-04-20T00:00:00.000Z',
  scopes: ['openid', 'email', 'https://www.googleapis.com/auth/youtube.force-ssl'],
  isDefault: true,
  createdAt: '2026-04-19T00:00:00.000Z',
  updatedAt: '2026-04-19T00:00:00.000Z',
};

const readonlyAccount = {
  ...manageAccount,
  scopes: ['openid', 'email', 'https://www.googleapis.com/auth/youtube.readonly'],
};

function bulkRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/youtube/subscriptions/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const smallwebLine =
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC_msctwlIh2cwM8yAtaju1A # Nick Sibicky https://www.youtube.com/channel/UC_msctwlIh2cwM8yAtaju1A';

const emptyPlan = {
  action: 'subscribe' as const,
  pending: [{ channelId: 'UC_msctwlIh2cwM8yAtaju1A', title: 'Nick Sibicky' }],
  skipped: [],
  estimatedQuotaUnits: 50,
  planningQuotaUnits: 1,
  withinDailyQuota: true,
  dailyWriteCapacity: 200,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireActiveSubscription.mockResolvedValue(null);
  mockGetUserIdFromRequest.mockResolvedValue('user-1');
  mockResolveYouTubeAccount.mockResolvedValue(manageAccount);
  mockPlanBulkSubscriptions.mockResolvedValue(emptyPlan);
});

describe('POST /api/youtube/subscriptions/bulk', () => {
  it('returns 401 when the request has no user', async () => {
    mockGetUserIdFromRequest.mockResolvedValue(null);

    const res = await POST(bulkRequest({ action: 'subscribe', text: smallwebLine }));

    expect(res.status).toBe(401);
  });

  it('rejects an unknown action', async () => {
    const res = await POST(bulkRequest({ action: 'follow', text: smallwebLine }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('action');
  });

  it('rejects a request with neither channels nor text', async () => {
    const res = await POST(bulkRequest({ action: 'subscribe' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('channels or text');
  });

  it('rejects a list with no resolvable channel ids', async () => {
    const res = await POST(bulkRequest({ action: 'subscribe', text: 'https://www.youtube.com/@handle' }));

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBe('no_channels');
    expect(payload.unresolved).toEqual(['https://www.youtube.com/@handle']);
  });

  it('requires the manage scope', async () => {
    mockResolveYouTubeAccount.mockResolvedValue(readonlyAccount);

    const res = await POST(bulkRequest({ action: 'subscribe', text: smallwebLine }));

    expect(res.status).toBe(412);
    expect((await res.json()).error).toBe('needs_reconnect');
  });

  it('defaults to a dry run and does not write', async () => {
    const res = await POST(bulkRequest({ action: 'subscribe', text: smallwebLine }));

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.dryRun).toBe(true);
    expect(payload.pendingCount).toBe(1);
    expect(payload.estimatedQuotaUnits).toBe(50);
    expect(mockExecuteBulkSubscriptions).not.toHaveBeenCalled();
  });

  it('executes only when dryRun is explicitly false', async () => {
    mockExecuteBulkSubscriptions.mockResolvedValue({
      action: 'subscribe',
      succeeded: [{ channelId: 'UC_msctwlIh2cwM8yAtaju1A', title: 'Nick Sibicky', status: 'ok' }],
      failed: [],
      remaining: [],
      quotaUnitsSpent: 50,
      quotaExceeded: false,
    });

    const res = await POST(bulkRequest({ action: 'subscribe', text: smallwebLine, dryRun: false }));

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.dryRun).toBe(false);
    expect(payload.succeededCount).toBe(1);
    expect(payload.quotaUnitsSpent).toBe(50);
    expect(mockExecuteBulkSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('passes maxWrites through to the executor', async () => {
    mockExecuteBulkSubscriptions.mockResolvedValue({
      action: 'subscribe',
      succeeded: [],
      failed: [],
      remaining: [],
      quotaUnitsSpent: 0,
      quotaExceeded: false,
    });

    await POST(bulkRequest({ action: 'subscribe', text: smallwebLine, dryRun: false, maxWrites: 25 }));

    expect(mockExecuteBulkSubscriptions).toHaveBeenCalledWith(
      manageAccount,
      emptyPlan,
      expect.objectContaining({ maxWrites: 25 })
    );
  });

  it('accepts an explicit channels array', async () => {
    const res = await POST(
      bulkRequest({ action: 'subscribe', channels: ['UC_msctwlIh2cwM8yAtaju1A'] })
    );

    expect(res.status).toBe(200);
    expect(mockPlanBulkSubscriptions).toHaveBeenCalledWith(manageAccount, 'subscribe', [
      { channelId: 'UC_msctwlIh2cwM8yAtaju1A', title: null },
    ]);
  });

  it('surfaces quota exhaustion as 429', async () => {
    mockPlanBulkSubscriptions.mockRejectedValue(
      new Error('YouTube API /subscriptions failed (403): quotaExceeded')
    );

    const res = await POST(bulkRequest({ action: 'subscribe', text: smallwebLine }));

    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('quota_exceeded');
  });

  it('rejects a list beyond the per-request cap', async () => {
    const channels = Array.from(
      { length: 1001 },
      (_, i) => `UC${String(i).padStart(22, '0')}`
    );

    const res = await POST(bulkRequest({ action: 'subscribe', channels }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('too_many_channels');
  });
});
