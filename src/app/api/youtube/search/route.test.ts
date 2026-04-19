import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockRequireActiveSubscription,
  mockGetUserIdFromRequest,
  mockGetAccountById,
  mockListAccountsForUser,
  mockSearchVideos,
} = vi.hoisted(() => ({
  mockRequireActiveSubscription: vi.fn(),
  mockGetUserIdFromRequest: vi.fn(),
  mockGetAccountById: vi.fn(),
  mockListAccountsForUser: vi.fn(),
  mockSearchVideos: vi.fn(),
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
    searchVideos: mockSearchVideos,
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

describe('GET /api/youtube/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireActiveSubscription.mockResolvedValue(null);
    mockGetUserIdFromRequest.mockResolvedValue('user-1');
    mockListAccountsForUser.mockResolvedValue([]);
    mockSearchVideos.mockResolvedValue({ items: [], nextPageToken: null, prevPageToken: null });
  });

  it('returns a reconnect error when the selected account is missing YouTube search scope', async () => {
    mockGetAccountById.mockResolvedValue({
      ...baseAccount,
      scopes: ['openid', 'email'],
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/youtube/search?q=lex+friedman&accountId=account-1')
    );
    const data = await response.json();

    expect(response.status).toBe(412);
    expect(data).toEqual({
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing search permission. Reconnect it from Manage accounts, then try again.',
    });
    expect(mockSearchVideos).not.toHaveBeenCalled();
  });

  it('translates Google insufficient-scope failures into a reconnect error', async () => {
    mockGetAccountById.mockResolvedValue(baseAccount);
    mockSearchVideos.mockRejectedValue(
      new Error(
        'YouTube API /search failed (403): {"error":{"details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}'
      )
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/youtube/search?q=lex+friedman&accountId=account-1')
    );
    const data = await response.json();

    expect(response.status).toBe(412);
    expect(data.error).toBe('needs_reconnect');
  });
});
