import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeAccount } from './types';

const { mockYtFetch } = vi.hoisted(() => ({
  mockYtFetch: vi.fn(),
}));

vi.mock('./client', () => ({
  ytFetch: mockYtFetch,
}));

import {
  addVideoComment,
  getVideoDetails,
  listVideoComments,
  listRecentChannelVideos,
  listSubscribedChannels,
  subscribeToChannel,
  unsubscribeFromChannel,
} from './service';

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

  it('gets full video details by id', async () => {
    mockYtFetch.mockResolvedValue({
      items: [
        {
          id: 'video-1',
          snippet: {
            title: 'Full Video',
            description: 'Full video description.',
            channelTitle: 'Channel One',
            channelId: 'channel-1',
            publishedAt: '2026-04-02T00:00:00.000Z',
            thumbnails: { default: { url: 'https://example.com/default.jpg' } },
          },
        },
      ],
    });

    const result = await getVideoDetails(account, 'video-1');

    expect(mockYtFetch).toHaveBeenCalledWith(account, {
      path: '/videos',
      params: {
        part: 'snippet',
        id: 'video-1',
        maxResults: 1,
      },
    });
    expect(result).toEqual({
      videoId: 'video-1',
      title: 'Full Video',
      description: 'Full video description.',
      channelTitle: 'Channel One',
      channelId: 'channel-1',
      publishedAt: '2026-04-02T00:00:00.000Z',
      thumbnailUrl: 'https://example.com/default.jpg',
    });
  });

  it('subscribes to a channel after checking for an existing subscription', async () => {
    mockYtFetch
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({
        id: 'subscription-new',
        snippet: {
          resourceId: { kind: 'youtube#channel', channelId: 'channel-new' },
        },
      });

    const result = await subscribeToChannel(account, 'channel-new');

    expect(mockYtFetch).toHaveBeenNthCalledWith(1, account, {
      path: '/subscriptions',
      params: {
        part: 'snippet',
        mine: 'true',
        forChannelId: 'channel-new',
        maxResults: 1,
      },
    });
    expect(mockYtFetch).toHaveBeenNthCalledWith(2, account, {
      path: '/subscriptions',
      method: 'POST',
      params: { part: 'snippet' },
      body: {
        snippet: {
          resourceId: {
            kind: 'youtube#channel',
            channelId: 'channel-new',
          },
        },
      },
    });
    expect(result).toEqual({ subscriptionId: 'subscription-new', channelId: 'channel-new' });
  });

  it('returns the existing subscription instead of inserting a duplicate', async () => {
    mockYtFetch.mockResolvedValue({
      items: [
        {
          id: 'subscription-existing',
          snippet: {
            title: 'Channel One',
            description: '',
            publishedAt: '2026-04-01T00:00:00.000Z',
            resourceId: { kind: 'youtube#channel', channelId: 'channel-1' },
          },
        },
      ],
    });

    const result = await subscribeToChannel(account, 'channel-1');

    expect(mockYtFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionId: 'subscription-existing', channelId: 'channel-1' });
  });

  it('unsubscribes by subscription id', async () => {
    mockYtFetch.mockResolvedValue(undefined);

    const result = await unsubscribeFromChannel(account, {
      subscriptionId: 'subscription-1',
      channelId: 'channel-1',
    });

    expect(mockYtFetch).toHaveBeenCalledWith(account, {
      path: '/subscriptions',
      method: 'DELETE',
      params: {
        id: 'subscription-1',
      },
    });
    expect(result).toEqual({ subscriptionId: 'subscription-1', channelId: 'channel-1' });
  });

  it('lists top-level comments for a video', async () => {
    mockYtFetch.mockResolvedValue({
      nextPageToken: 'next-comments',
      items: [
        {
          id: 'thread-1',
          snippet: {
            totalReplyCount: 2,
            topLevelComment: {
              id: 'comment-1',
              snippet: {
                authorDisplayName: 'Commenter',
                authorProfileImageUrl: 'https://example.com/avatar.jpg',
                authorChannelUrl: 'https://youtube.com/@commenter',
                textOriginal: 'Great video.',
                publishedAt: '2026-04-03T00:00:00.000Z',
                updatedAt: '2026-04-03T01:00:00.000Z',
                likeCount: 7,
              },
            },
          },
        },
      ],
    });

    const result = await listVideoComments(account, 'video-1', 'page-2');

    expect(mockYtFetch).toHaveBeenCalledWith(account, {
      path: '/commentThreads',
      params: {
        part: 'snippet',
        videoId: 'video-1',
        order: 'relevance',
        textFormat: 'plainText',
        maxResults: 20,
        pageToken: 'page-2',
      },
    });
    expect(result.items[0]).toEqual({
      commentId: 'comment-1',
      authorDisplayName: 'Commenter',
      authorProfileImageUrl: 'https://example.com/avatar.jpg',
      authorChannelUrl: 'https://youtube.com/@commenter',
      publishedAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T01:00:00.000Z',
      body: 'Great video.',
      likeCount: 7,
      totalReplyCount: 2,
    });
    expect(result.nextPageToken).toBe('next-comments');
  });

  it('adds a top-level video comment', async () => {
    mockYtFetch.mockResolvedValue({
      id: 'thread-new',
      snippet: {
        totalReplyCount: 0,
        topLevelComment: {
          id: 'comment-new',
          snippet: {
            authorDisplayName: 'User',
            textOriginal: 'Thanks for sharing.',
            publishedAt: '2026-04-04T00:00:00.000Z',
            likeCount: 0,
          },
        },
      },
    });

    const result = await addVideoComment(account, 'video-1', 'Thanks for sharing.');

    expect(mockYtFetch).toHaveBeenCalledWith(account, {
      path: '/commentThreads',
      method: 'POST',
      params: { part: 'snippet' },
      body: {
        snippet: {
          videoId: 'video-1',
          topLevelComment: {
            snippet: {
              textOriginal: 'Thanks for sharing.',
            },
          },
        },
      },
    });
    expect(result).toMatchObject({
      commentId: 'comment-new',
      authorDisplayName: 'User',
      body: 'Thanks for sharing.',
    });
  });
});
