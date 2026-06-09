import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockRequireActiveSubscription,
  mockGetUserIdFromRequest,
  mockGetAccountById,
  mockListAccountsForUser,
  mockListSubscribedChannels,
} = vi.hoisted(() => ({
  mockRequireActiveSubscription: vi.fn(),
  mockGetUserIdFromRequest: vi.fn(),
  mockGetAccountById: vi.fn(),
  mockListAccountsForUser: vi.fn(),
  mockListSubscribedChannels: vi.fn(),
}));

vi.mock('@/lib/subscription/guard', () => ({
  requireActiveSubscription: mockRequireActiveSubscription,
}));

vi.mock('@/lib/youtube/request-auth', () => ({
  getUserIdFromRequest: mockGetUserIdFromRequest,
}));

vi.mock('@/lib/youtube', async () => {
  const actual = await vi.importActual<typeof import('@/lib/youtube')>('@/lib/youtube');
  return {
    ...actual,
    getAccountById: mockGetAccountById,
    listAccountsForUser: mockListAccountsForUser,
    listSubscribedChannels: mockListSubscribedChannels,
  };
});

import { GET } from './route';

const baseAccount = {
  id: 'account-1',
  userId: 'user-1',
  googleSub: 'google-sub',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenExpiresAt: '2026-04-20T00:00:00.000Z',
  scopes: ['openid', 'email', 'https://www.googleapis.com/auth/youtube.readonly'],
  isDefault: true,
  createdAt: '2026-04-19T00:00:00.000Z',
  updatedAt: '2026-04-19T00:00:00.000Z',
};

describe('GET /api/youtube/subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireActiveSubscription.mockResolvedValue(null);
    mockGetUserIdFromRequest.mockResolvedValue('user-1');
    mockGetAccountById.mockResolvedValue(baseAccount);
    mockListAccountsForUser.mockResolvedValue([baseAccount]);
    mockListSubscribedChannels.mockResolvedValue({
      items: [],
      nextPageToken: null,
      prevPageToken: null,
    });
  });

  it('returns the selected account subscriptions', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/youtube/subscriptions?accountId=account-1&pageToken=next')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ items: [], nextPageToken: null, prevPageToken: null });
    expect(mockGetAccountById).toHaveBeenCalledWith('user-1', 'account-1');
    expect(mockListSubscribedChannels).toHaveBeenCalledWith(baseAccount, 'next');
  });

  it('returns a reconnect error when the account is missing YouTube scope', async () => {
    mockGetAccountById.mockResolvedValue({ ...baseAccount, scopes: ['openid', 'email'] });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/youtube/subscriptions?accountId=account-1')
    );
    const data = await response.json();

    expect(response.status).toBe(412);
    expect(data.error).toBe('needs_reconnect');
    expect(mockListSubscribedChannels).not.toHaveBeenCalled();
  });
});
