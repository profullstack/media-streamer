/**
 * High-level YouTube service methods.
 *
 * Each function takes a YouTubeAccount and returns a simplified,
 * frontend-friendly shape (camelCase, only the fields we actually use).
 */

import { ytFetch } from './client';
import type { YouTubeAccount } from './types';

export interface YouTubeSearchItem {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string | null;
}

export interface YouTubeSearchResponse {
  items: YouTubeSearchItem[];
  nextPageToken: string | null;
  prevPageToken: string | null;
}

export interface YouTubeSubscriptionChannel {
  subscriptionId: string;
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  newItemCount: number | null;
  totalItemCount: number | null;
}

export interface YouTubeSubscriptionsResponse {
  items: YouTubeSubscriptionChannel[];
  nextPageToken: string | null;
  prevPageToken: string | null;
}

export interface YouTubeSubscriptionMutationResult {
  subscriptionId: string;
  channelId: string;
}

export interface YouTubeVideoDetails {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string | null;
}

export interface YouTubeComment {
  commentId: string;
  authorDisplayName: string;
  authorProfileImageUrl: string | null;
  authorChannelUrl: string | null;
  publishedAt: string;
  updatedAt: string | null;
  body: string;
  likeCount: number;
  totalReplyCount: number;
}

export interface YouTubeCommentsResponse {
  items: YouTubeComment[];
  nextPageToken: string | null;
  prevPageToken: string | null;
}

interface RawSearchListResponse {
  nextPageToken?: string;
  prevPageToken?: string;
  items: Array<{
    id: { kind: string; videoId?: string };
    snippet: {
      title: string;
      description: string;
      channelTitle: string;
      channelId: string;
      publishedAt: string;
      thumbnails?: {
        medium?: { url: string };
        high?: { url: string };
        default?: { url: string };
      };
    };
  }>;
}

interface RawVideoListResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      channelTitle: string;
      channelId: string;
      publishedAt: string;
      thumbnails?: {
        medium?: { url: string };
        high?: { url: string };
        default?: { url: string };
      };
    };
  }>;
}

interface RawSubscriptionsListResponse {
  nextPageToken?: string;
  prevPageToken?: string;
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      resourceId?: {
        kind: string;
        channelId?: string;
      };
      thumbnails?: {
        medium?: { url: string };
        high?: { url: string };
        default?: { url: string };
      };
    };
    contentDetails?: {
      newItemCount?: number;
      totalItemCount?: number;
    };
  }>;
}

interface RawSubscriptionResource {
  id: string;
  snippet?: {
    resourceId?: {
      kind: string;
      channelId?: string;
    };
  };
}

interface RawCommentThreadListResponse {
  nextPageToken?: string;
  prevPageToken?: string;
  items: RawCommentThreadResource[];
}

interface RawCommentThreadResource {
  id: string;
  snippet: {
    videoId?: string;
    totalReplyCount?: number;
    topLevelComment: {
      id: string;
      snippet: {
        authorDisplayName?: string;
        authorProfileImageUrl?: string;
        authorChannelUrl?: string;
        textDisplay?: string;
        textOriginal?: string;
        publishedAt: string;
        updatedAt?: string;
        likeCount?: number;
      };
    };
  };
}

function pickThumbnail(thumbnails?: {
  medium?: { url: string };
  high?: { url: string };
  default?: { url: string };
}): string | null {
  return thumbnails?.medium?.url ?? thumbnails?.high?.url ?? thumbnails?.default?.url ?? null;
}

function mapCommentThread(item: RawCommentThreadResource): YouTubeComment {
  const comment = item.snippet.topLevelComment;
  const snippet = comment.snippet;

  return {
    commentId: comment.id,
    authorDisplayName: snippet.authorDisplayName ?? 'YouTube user',
    authorProfileImageUrl: snippet.authorProfileImageUrl ?? null,
    authorChannelUrl: snippet.authorChannelUrl ?? null,
    publishedAt: snippet.publishedAt,
    updatedAt: snippet.updatedAt ?? null,
    body: snippet.textOriginal ?? snippet.textDisplay ?? '',
    likeCount: snippet.likeCount ?? 0,
    totalReplyCount: item.snippet.totalReplyCount ?? 0,
  };
}

export async function searchVideos(
  account: YouTubeAccount,
  query: string,
  pageToken?: string
): Promise<YouTubeSearchResponse> {
  const raw = await ytFetch<RawSearchListResponse>(account, {
    path: '/search',
    params: {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 25,
      pageToken,
    },
  });

  const items: YouTubeSearchItem[] = raw.items
    .filter((i) => i.id.kind === 'youtube#video' && i.id.videoId)
    .map((i) => {
      return {
        videoId: i.id.videoId!,
        title: i.snippet.title,
        description: i.snippet.description,
        channelTitle: i.snippet.channelTitle,
        channelId: i.snippet.channelId,
        publishedAt: i.snippet.publishedAt,
        thumbnailUrl: pickThumbnail(i.snippet.thumbnails),
      };
    });

  return {
    items,
    nextPageToken: raw.nextPageToken ?? null,
    prevPageToken: raw.prevPageToken ?? null,
  };
}

export async function getVideoDetails(
  account: YouTubeAccount,
  videoId: string
): Promise<YouTubeVideoDetails | null> {
  const raw = await ytFetch<RawVideoListResponse>(account, {
    path: '/videos',
    params: {
      part: 'snippet',
      id: videoId,
      maxResults: 1,
    },
  });

  const item = raw.items[0];
  if (!item) return null;

  return {
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
  };
}

export async function listSubscribedChannels(
  account: YouTubeAccount,
  pageToken?: string
): Promise<YouTubeSubscriptionsResponse> {
  const raw = await ytFetch<RawSubscriptionsListResponse>(account, {
    path: '/subscriptions',
    params: {
      part: ['snippet', 'contentDetails'],
      mine: 'true',
      maxResults: 50,
      pageToken,
    },
  });

  const items = raw.items
    .filter((item) => item.snippet.resourceId?.kind === 'youtube#channel' && item.snippet.resourceId.channelId)
    .map((item) => ({
      subscriptionId: item.id,
      channelId: item.snippet.resourceId!.channelId!,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
      publishedAt: item.snippet.publishedAt,
      newItemCount: item.contentDetails?.newItemCount ?? null,
      totalItemCount: item.contentDetails?.totalItemCount ?? null,
    }));

  return {
    items,
    nextPageToken: raw.nextPageToken ?? null,
    prevPageToken: raw.prevPageToken ?? null,
  };
}

export async function findSubscriptionByChannelId(
  account: YouTubeAccount,
  channelId: string
): Promise<YouTubeSubscriptionMutationResult | null> {
  const raw = await ytFetch<RawSubscriptionsListResponse>(account, {
    path: '/subscriptions',
    params: {
      part: 'snippet',
      mine: 'true',
      forChannelId: channelId,
      maxResults: 1,
    },
  });

  const item = raw.items.find((subscription) => subscription.snippet.resourceId?.channelId === channelId);
  if (!item) return null;

  return {
    subscriptionId: item.id,
    channelId,
  };
}

export async function subscribeToChannel(
  account: YouTubeAccount,
  channelId: string
): Promise<YouTubeSubscriptionMutationResult> {
  const existing = await findSubscriptionByChannelId(account, channelId);
  if (existing) return existing;

  const raw = await ytFetch<RawSubscriptionResource>(account, {
    path: '/subscriptions',
    method: 'POST',
    params: {
      part: 'snippet',
    },
    body: {
      snippet: {
        resourceId: {
          kind: 'youtube#channel',
          channelId,
        },
      },
    },
  });

  return {
    subscriptionId: raw.id,
    channelId: raw.snippet?.resourceId?.channelId ?? channelId,
  };
}

export async function unsubscribeFromChannel(
  account: YouTubeAccount,
  input: { subscriptionId?: string; channelId?: string }
): Promise<YouTubeSubscriptionMutationResult> {
  let subscriptionId = input.subscriptionId;
  const channelId = input.channelId;

  if (!subscriptionId && channelId) {
    const existing = await findSubscriptionByChannelId(account, channelId);
    subscriptionId = existing?.subscriptionId;
  }

  if (!subscriptionId) {
    throw new Error('YouTube subscription not found');
  }

  await ytFetch<void>(account, {
    path: '/subscriptions',
    method: 'DELETE',
    params: {
      id: subscriptionId,
    },
  });

  return {
    subscriptionId,
    channelId: channelId ?? '',
  };
}

export async function listRecentChannelVideos(
  account: YouTubeAccount,
  channelId: string,
  pageToken?: string
): Promise<YouTubeSearchResponse> {
  const raw = await ytFetch<RawSearchListResponse>(account, {
    path: '/search',
    params: {
      part: 'snippet',
      channelId,
      type: 'video',
      order: 'date',
      maxResults: 12,
      pageToken,
    },
  });

  const items: YouTubeSearchItem[] = raw.items
    .filter((i) => i.id.kind === 'youtube#video' && i.id.videoId)
    .map((i) => ({
      videoId: i.id.videoId!,
      title: i.snippet.title,
      description: i.snippet.description,
      channelTitle: i.snippet.channelTitle,
      channelId: i.snippet.channelId,
      publishedAt: i.snippet.publishedAt,
      thumbnailUrl: pickThumbnail(i.snippet.thumbnails),
    }));

  return {
    items,
    nextPageToken: raw.nextPageToken ?? null,
    prevPageToken: raw.prevPageToken ?? null,
  };
}

export async function listVideoComments(
  account: YouTubeAccount,
  videoId: string,
  pageToken?: string
): Promise<YouTubeCommentsResponse> {
  const raw = await ytFetch<RawCommentThreadListResponse>(account, {
    path: '/commentThreads',
    params: {
      part: 'snippet',
      videoId,
      order: 'relevance',
      textFormat: 'plainText',
      maxResults: 20,
      pageToken,
    },
  });

  return {
    items: raw.items.map(mapCommentThread),
    nextPageToken: raw.nextPageToken ?? null,
    prevPageToken: raw.prevPageToken ?? null,
  };
}

export async function addVideoComment(
  account: YouTubeAccount,
  videoId: string,
  body: string
): Promise<YouTubeComment> {
  const raw = await ytFetch<RawCommentThreadResource>(account, {
    path: '/commentThreads',
    method: 'POST',
    params: {
      part: 'snippet',
    },
    body: {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: {
            textOriginal: body,
          },
        },
      },
    },
  });

  return mapCommentThread(raw);
}
