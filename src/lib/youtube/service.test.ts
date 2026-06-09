import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeAccount } from './types';

const { mockYtFetch } = vi.hoisted(() => ({
  mockYtFetch: vi.fn(),
}));

vi.mock('./client', () => ({
  ytFetch: mockYtFetch,
}));

import { listRecentChannelVideos, listSubscribedChannels } from './service';

const account: YouTubeAccount = {
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

describe('youtube/service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists subscribed channels with readonly subscription parameters', async () => {
    mockYtFetch.mockResolvedValue({
      nextPageToken: 'next-subs',
      items: [
        {
          id: 'subscription-1',
          snippet: {
            title: 'Channel One',
            description: 'Videos about one thing.',
            publishedAt: '2026-04-01T00:00:00.000Z',
            resourceId: { kind: 'youtube#channel', channelId: 'channel-1' },
            thumbnails: { medium: { url: 'https://example.com/channel.jpg' } },
          },
          contentDetails: { newItemCount: 3, totalItemCount: 100 },
        },
      ],
    });

    const result = await listSubscribedChannels(account, 'page-2');

    expect(mockYtFetch).toHaveBeenCalledWith(account, {
      path: '/subscriptions',
      params: {
        part: ['snippet', 'contentDetails'],
        mine: 'true',
        maxResults: 50,
        pageToken: 'page-2',
      },
    });
    expect(result).toEqual({
      items: [
        {
          subscriptionId: 'subscription-1',
          channelId: 'channel-1',
          title: 'Channel One',
          description: 'Videos about one thing.',
          thumbnailUrl: 'https://example.com/channel.jpg',
          publishedAt: '2026-04-01T00:00:00.000Z',
          newItemCount: 3,
          totalItemCount: 100,
        },
      ],
      nextPageToken: 'next-subs',
      prevPageToken: null,
    });
  });

  it('lists recent videos for a selected channel ordered by date', async () => {
    mockYtFetch.mockResolvedValue({
      items: [
        {
          id: { kind: 'youtube#video', videoId: 'video-1' },
          snippet: {
            title: 'Recent Upload',
            description: 'Newest video.',
            channelTitle: 'Channel One',
            channelId: 'channel-1',
            publishedAt: '2026-04-02T00:00:00.000Z',
            thumbnails: { high: { url: 'https://example.com/video.jpg' } },
          },
        },
      ],
    });

    const result = await listRecentChannelVideos(account, 'channel-1');

    expect(mockYtFetch).toHaveBeenCalledWith(account, {
      path: '/search',
      params: {
        part: 'snippet',
        channelId: 'channel-1',
        type: 'video',
        order: 'date',
        maxResults: 12,
        pageToken: undefined,
      },
    });
    expect(result.items[0]).toMatchObject({
      videoId: 'video-1',
      title: 'Recent Upload',
      channelId: 'channel-1',
      thumbnailUrl: 'https://example.com/video.jpg',
    });
  });
});
