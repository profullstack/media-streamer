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
      const thumb =
        i.snippet.thumbnails?.medium?.url ??
        i.snippet.thumbnails?.high?.url ??
        i.snippet.thumbnails?.default?.url ??
        null;
      return {
        videoId: i.id.videoId!,
        title: i.snippet.title,
        description: i.snippet.description,
        channelTitle: i.snippet.channelTitle,
        channelId: i.snippet.channelId,
        publishedAt: i.snippet.publishedAt,
        thumbnailUrl: thumb,
      };
    });

  return {
    items,
    nextPageToken: raw.nextPageToken ?? null,
    prevPageToken: raw.prevPageToken ?? null,
  };
}
