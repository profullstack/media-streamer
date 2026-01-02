/**
 * IPTV Channels API Route
 * 
 * GET /api/iptv/channels?m3uUrl=<url>&q=<search>&group=<group>&limit=<n>&offset=<n>
 * 
 * Fetches and parses M3U playlists with Redis caching (5 min TTL).
 * Supports server-side search with word-order-independent matching.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseM3U,
  searchChannels,
  extractGroups,
  getProxiedUrl,
  getPlaylistCache,
  PlaylistCache,
  type Channel,
  type CachedPlaylist,
} from '@/lib/iptv';

/**
 * Request timeout for fetching M3U playlists
 */
const FETCH_TIMEOUT = 30000;

/**
 * Default pagination limit
 */
const DEFAULT_LIMIT = 50;

/**
 * Maximum pagination limit
 */
const MAX_LIMIT = 200;

/**
 * Validates if a string is a valid URL
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Applies proxy to HTTP URLs in channels
 */
function applyProxyToChannels(channels: Channel[]): Channel[] {
  return channels.map(channel => ({
    ...channel,
    url: getProxiedUrl(channel.url),
    logo: channel.logo ? getProxiedUrl(channel.logo) : undefined,
  }));
}

/**
 * GET /api/iptv/channels
 * 
 * Query parameters:
 * - m3uUrl: (required) The M3U playlist URL to fetch
 * - q: (optional) Search query (words can be in any order)
 * - group: (optional) Filter by group/category
 * - limit: (optional) Number of results to return (default: 50, max: 200)
 * - offset: (optional) Offset for pagination (default: 0)
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const m3uUrl = searchParams.get('m3uUrl');
  const query = searchParams.get('q') ?? '';
  const group = searchParams.get('group') ?? undefined;
  const limit = Math.min(
    parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

  // Validate m3uUrl parameter
  if (!m3uUrl) {
    return NextResponse.json(
      { error: 'Missing required parameter: m3uUrl' },
      { status: 400 }
    );
  }

  if (!isValidUrl(m3uUrl)) {
    return NextResponse.json(
      { error: 'Invalid m3uUrl parameter' },
      { status: 400 }
    );
  }

  const cache = getPlaylistCache();
  const cacheKey = PlaylistCache.generateKey(m3uUrl);

  // Try to get from cache
  let playlist = await cache.get(cacheKey);
  let cached = false;

  if (playlist) {
    cached = true;
  } else {
    // Fetch and parse the M3U playlist
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(m3uUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; IPTV/1.0)',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch M3U playlist: ${response.status} ${response.statusText}` },
          { status: 502 }
        );
      }

      const m3uContent = await response.text();
      const channels = parseM3U(m3uContent);
      const groups = extractGroups(channels);

      playlist = {
        channels,
        groups,
        fetchedAt: Date.now(),
        m3uUrl,
      };

      // Cache the playlist
      await cache.set(cacheKey, playlist);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout while fetching M3U playlist' },
          { status: 504 }
        );
      }

      console.error('[IPTV Channels] Error fetching playlist:', error);
      return NextResponse.json(
        { error: 'Failed to fetch M3U playlist' },
        { status: 502 }
      );
    }
  }

  // Search and filter channels
  const filteredChannels = searchChannels(playlist.channels, query, group);
  const total = filteredChannels.length;

  // Apply pagination
  const paginatedChannels = filteredChannels.slice(offset, offset + limit);

  // Apply proxy to HTTP URLs
  const proxiedChannels = applyProxyToChannels(paginatedChannels);

  return NextResponse.json({
    channels: proxiedChannels,
    groups: playlist.groups,
    total,
    limit,
    offset,
    cached,
    fetchedAt: playlist.fetchedAt,
  });
}
