/**
 * IPTV Channels API Route
 *
 * GET /api/iptv/channels?playlistId=<id>&q=<search>&group=<group>&limit=<n>&offset=<n>
 * GET /api/iptv/channels?m3uUrl=<url>&q=<search>&group=<group>&limit=<n>&offset=<n>
 *
 * Supports two modes:
 * 1. Worker cache mode (playlistId): Fast reads from worker-populated Redis cache
 * 2. On-demand mode (m3uUrl): Fetches and parses M3U with 5-min request cache
 *
 * Supports server-side search with word-order-independent matching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Agent, fetch as undiciFetch } from 'undici';
import {
  parseM3U,
  searchChannels,
  extractGroups,
  getProxiedUrl,
  getPlaylistCache,
  PlaylistCache,
  type Channel,
} from '@/lib/iptv';
import { getIptvCacheReader } from '@/lib/iptv/cache-reader';
import { createServerClient } from '@/lib/supabase';

/**
 * Undici agent that ignores SSL certificate errors.
 * Required for IPTV providers with self-signed or invalid certificates.
 */
const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

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
 * - playlistId: (preferred) Playlist ID for worker cache reads
 * - m3uUrl: (fallback) The M3U playlist URL to fetch on-demand
 * - q: (optional) Search query (words can be in any order)
 * - group: (optional) Filter by group/category
 * - limit: (optional) Number of results to return (default: 50, max: 200)
 * - offset: (optional) Offset for pagination (default: 0)
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  const m3uUrl = searchParams.get('m3uUrl');
  const query = searchParams.get('q') ?? '';
  const group = searchParams.get('group') ?? undefined;
  const limit = Math.min(
    parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

  // Validate that at least one identifier is provided
  if (!playlistId && !m3uUrl) {
    return NextResponse.json(
      { error: 'Missing required parameter: playlistId or m3uUrl' },
      { status: 400 }
    );
  }

  let channels: Channel[] = [];
  let groups: string[] = [];
  let cached = false;
  let fetchedAt = Date.now();

  // Try worker cache first if playlistId is provided
  if (playlistId) {
    const cacheReader = getIptvCacheReader();

    // Try to get channels from worker cache
    if (group) {
      // Efficient group-specific query
      const result = await cacheReader.getChannelsByGroup(playlistId, group);
      if (result.success && result.data) {
        channels = result.data;
        cached = true;
      }
    } else {
      // Get all channels
      const result = await cacheReader.getPlaylistChannels(playlistId);
      if (result.success && result.data) {
        channels = result.data;
        cached = true;
      }
    }

    // Get groups
    const groupsResult = await cacheReader.getPlaylistGroups(playlistId);
    if (groupsResult.success && groupsResult.data) {
      groups = groupsResult.data;
    }

    // Get metadata for fetchedAt
    const metaResult = await cacheReader.getPlaylistMeta(playlistId);
    if (metaResult.success && metaResult.data) {
      fetchedAt = metaResult.data.fetchedAt;
    }

    if (cached) {
      console.log('[IPTV Channels] Serving from worker cache:', {
        playlistId,
        channelCount: channels.length,
        groupCount: groups.length,
      });
    }
  }

  // Fall back to on-demand fetch if worker cache miss
  let effectiveM3uUrl = m3uUrl;

  // If we have a playlistId but no cached data, try to get m3uUrl from metadata or database
  if (!cached && playlistId && !effectiveM3uUrl) {
    // First try cache metadata (might have m3uUrl even if channels aren't cached)
    const cacheReader = getIptvCacheReader();
    const metaResult = await cacheReader.getPlaylistMeta(playlistId);

    if (metaResult.success && metaResult.data?.m3uUrl) {
      effectiveM3uUrl = metaResult.data.m3uUrl;
      console.log('[IPTV Channels] Got m3uUrl from cache metadata:', playlistId);
    } else {
      // Fall back to database lookup
      try {
        const supabase = createServerClient();
        const { data: playlist, error } = await supabase
          .from('iptv_playlists')
          .select('m3u_url')
          .eq('id', playlistId)
          .single();

        if (!error && playlist?.m3u_url) {
          effectiveM3uUrl = playlist.m3u_url;
          console.log('[IPTV Channels] Got m3uUrl from database:', playlistId);
        }
      } catch (dbError) {
        console.error('[IPTV Channels] Error fetching playlist from database:', dbError);
      }
    }
  }

  if (!cached && effectiveM3uUrl) {
    if (!isValidUrl(effectiveM3uUrl)) {
      return NextResponse.json(
        { error: 'Invalid m3uUrl parameter' },
        { status: 400 }
      );
    }

    const cache = getPlaylistCache();
    const cacheKey = PlaylistCache.generateKey(effectiveM3uUrl);

    // Try to get from request cache
    const playlist = await cache.get(cacheKey);

    if (playlist) {
      cached = true;
      channels = playlist.channels;
      groups = playlist.groups;
      fetchedAt = playlist.fetchedAt;
    } else {
      // Fetch and parse the M3U playlist
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await undiciFetch(effectiveM3uUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; IPTV/1.0)',
          },
          dispatcher: insecureAgent,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return NextResponse.json(
            { error: `Failed to fetch M3U playlist: ${response.status} ${response.statusText}` },
            { status: 502 }
          );
        }

        const m3uContent = await response.text();
        channels = parseM3U(m3uContent);
        groups = extractGroups(channels);
        fetchedAt = Date.now();

        // Cache the playlist
        await cache.set(cacheKey, {
          channels,
          groups,
          fetchedAt,
          m3uUrl: effectiveM3uUrl,
        });
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
  }

  // If still no channels, return error
  if (channels.length === 0 && !cached) {
    const errorMsg = playlistId && !effectiveM3uUrl
      ? 'Playlist not found in cache or database'
      : 'No channels found in playlist';
    return NextResponse.json(
      { error: errorMsg },
      { status: 404 }
    );
  }

  // Search and filter channels (only if not already filtered by group from worker cache)
  let filteredChannels = channels;
  if (query || (group && !playlistId)) {
    filteredChannels = searchChannels(channels, query, group);
  } else if (query) {
    // Apply search even when group was already filtered
    filteredChannels = searchChannels(channels, query);
  }

  const total = filteredChannels.length;

  // Apply pagination
  const paginatedChannels = filteredChannels.slice(offset, offset + limit);

  // Apply proxy to HTTP URLs
  const proxiedChannels = applyProxyToChannels(paginatedChannels);

  return NextResponse.json({
    channels: proxiedChannels,
    groups,
    total,
    limit,
    offset,
    cached,
    fetchedAt,
    workerCached: playlistId ? cached : undefined,
  });
}
