import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockRequireActiveSubscription,
  mockGetUserIdFromRequest,
  mockGetAccountById,
  mockListAccountsForUser,
  mockListRecentChannelVideos,
} = vi.hoisted(() => ({
  mockRequireActiveSubscription: vi.fn(),
  mockGetUserIdFromRequest: vi.fn(),
  mockGetAccountById: vi.fn(),
  mockListAccountsForUser: vi.fn(),
  mockListRecentChannelVideos: vi.fn(),
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
    listRecentChannelVideos: mockListRecentChannelVideos,
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

describe('GET /api/youtube/subscriptions/videos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireActiveSubscription.mockResolvedValue(null);
    mockGetUserIdFromRequest.mockResolvedValue('user-1');
    mockGetAccountById.mockResolvedValue(baseAccount);
    mockListAccountsForUser.mockResolvedValue([baseAccount]);
    mockListRecentChannelVideos.mockResolvedValue({
      items: [],
      nextPageToken: null,
      prevPageToken: null,
    });
  });

  it('requires a channel id', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/youtube/subscriptions/videos?accountId=account-1')
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required parameter: channelId');
    expect(mockListRecentChannelVideos).not.toHaveBeenCalled();
  });

  it('returns recent videos for the selected channel', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/youtube/subscriptions/videos?accountId=account-1&channelId=channel-1&pageToken=next'
      )
    );

    expect(response.status).toBe(200);
    expect(mockListRecentChannelVideos).toHaveBeenCalledWith(baseAccount, 'channel-1', 'next');
  });
});
