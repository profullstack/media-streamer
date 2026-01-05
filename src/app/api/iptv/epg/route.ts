/**
 * IPTV EPG API Route
 *
 * GET /api/iptv/epg?playlistId=<id>&channelId=<id>&from=<timestamp>&to=<timestamp>
 * GET /api/iptv/epg/now?playlistId=<id>&channelIds=<id1,id2,...>
 *
 * Reads EPG (Electronic Program Guide) data from the worker cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIptvCacheReader, type EpgProgram } from '@/lib/iptv/cache-reader';

/**
 * GET /api/iptv/epg
 *
 * Query parameters:
 * - playlistId: (required) Playlist ID
 * - channelId: (optional) Single channel ID for schedule
 * - channelIds: (optional) Comma-separated channel IDs for now playing
 * - from: (optional) Start time as Unix timestamp
 * - to: (optional) End time as Unix timestamp
 * - now: (optional) If "true", return only currently playing programs
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  const channelId = searchParams.get('channelId');
  const channelIdsParam = searchParams.get('channelIds');
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const nowMode = searchParams.get('now') === 'true';

  // Validate playlistId
  if (!playlistId) {
    return NextResponse.json(
      { error: 'Missing required parameter: playlistId' },
      { status: 400 }
    );
  }

  const cacheReader = getIptvCacheReader();

  // Check if cache is available
  const isAvailable = await cacheReader.isAvailable();
  if (!isAvailable) {
    return NextResponse.json(
      { error: 'EPG cache not available' },
      { status: 503 }
    );
  }

  // Mode 1: Get currently playing programs for multiple channels
  if (nowMode || channelIdsParam) {
    const channelIds = channelIdsParam?.split(',').filter(Boolean) ?? [];

    if (channelIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameter: channelIds' },
        { status: 400 }
      );
    }

    const result = await cacheReader.getCurrentPrograms(playlistId, channelIds);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to get EPG data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      playlistId,
      programs: result.data,
      cached: result.cached,
      fetchedAt: Date.now(),
    });
  }

  // Mode 2: Get schedule for a single channel
  if (channelId) {
    const from = fromParam ? parseInt(fromParam, 10) : undefined;
    const to = toParam ? parseInt(toParam, 10) : undefined;

    const result = await cacheReader.getChannelPrograms(playlistId, channelId, from, to);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to get EPG data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      playlistId,
      channelId,
      programs: result.data,
      cached: result.cached,
      fetchedAt: Date.now(),
    });
  }

  // Mode 3: Get current program for a single channel (if no time range)
  return NextResponse.json(
    { error: 'Missing required parameter: channelId or channelIds' },
    { status: 400 }
  );
}
