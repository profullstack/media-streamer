import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockRequireActiveSubscription,
  mockGetUserIdFromRequest,
  mockGetAccountById,
  mockListAccountsForUser,
  mockListVideoComments,
  mockAddVideoComment,
} = vi.hoisted(() => ({
  mockRequireActiveSubscription: vi.fn(),
  mockGetUserIdFromRequest: vi.fn(),
  mockGetAccountById: vi.fn(),
  mockListAccountsForUser: vi.fn(),
  mockListVideoComments: vi.fn(),
  mockAddVideoComment: vi.fn(),
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
    listVideoComments: mockListVideoComments,
    addVideoComment: mockAddVideoComment,
  };
});

import { GET, POST } from './route';

const readonlyAccount = {
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

const writeAccount = {
  ...readonlyAccount,
  scopes: ['openid', 'email', 'https://www.googleapis.com/auth/youtube.force-ssl'],
};

describe('/api/youtube/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireActiveSubscription.mockResolvedValue(null);
    mockGetUserIdFromRequest.mockResolvedValue('user-1');
    mockGetAccountById.mockResolvedValue(readonlyAccount);
    mockListAccountsForUser.mockResolvedValue([readonlyAccount]);
    mockListVideoComments.mockResolvedValue({ items: [], nextPageToken: null, prevPageToken: null });
    mockAddVideoComment.mockResolvedValue({
      commentId: 'comment-1',
      authorDisplayName: 'User',
      authorProfileImageUrl: null,
      authorChannelUrl: null,
      publishedAt: '2026-04-21T00:00:00.000Z',
      updatedAt: null,
      body: 'Nice video.',
      likeCount: 0,
      totalReplyCount: 0,
    });
  });

  it('lists comments with a read-scoped account', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/youtube/comments?accountId=account-1&videoId=video-1&pageToken=next')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ items: [], nextPageToken: null, prevPageToken: null });
    expect(mockListVideoComments).toHaveBeenCalledWith(readonlyAccount, 'video-1', 'next');
  });

  it('requires write scope before posting a comment', async () => {
    const response = await POST(
      new NextRequest('http://localhost:3000/api/youtube/comments', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'account-1', videoId: 'video-1', body: 'Nice video.' }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(412);
    expect(data.error).toBe('needs_reconnect');
    expect(mockAddVideoComment).not.toHaveBeenCalled();
  });

  it('posts a comment with a write-scoped account', async () => {
    mockGetAccountById.mockResolvedValue(writeAccount);

    const response = await POST(
      new NextRequest('http://localhost:3000/api/youtube/comments', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'account-1', videoId: 'video-1', body: 'Nice video.' }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.comment.body).toBe('Nice video.');
    expect(mockAddVideoComment).toHaveBeenCalledWith(writeAccount, 'video-1', 'Nice video.');
  });
});
