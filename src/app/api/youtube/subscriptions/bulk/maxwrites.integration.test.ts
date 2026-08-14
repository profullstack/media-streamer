/**
 * End-to-end check that maxWrites actually caps the number of API writes.
 *
 * The existing route test mocks executeBulkSubscriptions, and the bulk test
 * calls it directly — so neither proves the cap survives the trip through the
 * route. Only ytFetch and the account lookup are mocked here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRequireActiveSubscription, mockGetUserIdFromRequest, mockResolveYouTubeAccount, mockYtFetch } =
  vi.hoisted(() => ({
    mockRequireActiveSubscription: vi.fn(),
    mockGetUserIdFromRequest: vi.fn(),
    mockResolveYouTubeAccount: vi.fn(),
    mockYtFetch: vi.fn(),
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

// The only seam: every YouTube HTTP call. Everything above it is the real code.
vi.mock('@/lib/youtube/client', () => ({
  ytFetch: mockYtFetch,
}));

import { POST } from './route';

const STUB_VALUE = 'unused-by-mocked-calls';

const manageAccount = {
  id: 'account-1',
  userId: 'user-1',
  googleSub: 'google-sub',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
  accessToken: STUB_VALUE,
  refreshToken: STUB_VALUE,
  tokenExpiresAt: '2026-04-20T00:00:00.000Z',
  scopes: ['openid', 'email', 'https://www.googleapis.com/auth/youtube.force-ssl'],
  isDefault: true,
  createdAt: '2026-04-19T00:00:00.000Z',
  updatedAt: '2026-04-19T00:00:00.000Z',
};

/** 20 channels, none of them currently subscribed. */
const channels = Array.from({ length: 20 }, (_, i) => `UC${String(i).padStart(22, 'a')}`);

function writeCalls(): number {
  return mockYtFetch.mock.calls.filter((call) => call[1]?.method === 'POST').length;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireActiveSubscription.mockResolvedValue(null);
  mockGetUserIdFromRequest.mockResolvedValue('user-1');
  mockResolveYouTubeAccount.mockResolvedValue(manageAccount);

  mockYtFetch.mockImplementation(async (_account, options) => {
    // subscriptions.list during planning: report an empty subscription set.
    if (!options.method || options.method === 'GET') {
      return { items: [], nextPageToken: null, prevPageToken: null };
    }
    return { id: 'new-sub', snippet: { resourceId: { channelId: 'x' } } };
  });
});

function bulkRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/youtube/subscriptions/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('maxWrites is honoured end to end', () => {
  it('writes only 2 channels when maxWrites is 2', async () => {
    const res = await POST(
      bulkRequest({ action: 'subscribe', channels, dryRun: false, maxWrites: 2 })
    );

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(writeCalls()).toBe(2);
    expect(payload.succeededCount).toBe(2);
    expect(payload.remainingCount).toBe(18);
  });

  it('a dry run performs no writes at all', async () => {
    const res = await POST(bulkRequest({ action: 'subscribe', channels, dryRun: true }));

    expect(res.status).toBe(200);
    expect(writeCalls()).toBe(0);
  });

  it('writes every pending channel when maxWrites is omitted', async () => {
    await POST(bulkRequest({ action: 'subscribe', channels, dryRun: false }));

    expect(writeCalls()).toBe(20);
  });
});
