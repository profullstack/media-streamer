/**
 * Swarm Stats API Route
 *
 * GET /api/torrents/:id/swarm - Get realtime swarm statistics (seeders/leechers)
 *
 * This endpoint fetches fresh swarm statistics from BitTorrent trackers.
 * It's designed for realtime updates in the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTorrentById, getTorrentByInfohash } from '@/lib/supabase';
import { scrapeMultipleTrackers, SCRAPE_TRACKERS } from '@/lib/tracker-scrape';
import type { Torrent } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Check if a string is a valid UUID v4
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Check if a string is a valid infohash (40 hex characters)
 */
function isInfohash(str: string): boolean {
  const infohashRegex = /^[0-9a-f]{40}$/i;
  return infohashRegex.test(str);
}

/**
 * Get torrent by either UUID or infohash
 */
async function getTorrent(id: string): Promise<Torrent | null> {
  if (isUUID(id)) {
    return getTorrentById(id);
  } else if (isInfohash(id)) {
    return getTorrentByInfohash(id);
  }
  // If neither, try infohash first (more common in URLs)
  return getTorrentByInfohash(id);
}

/**
 * Extract tracker URLs from a magnet URI
 */
function extractTrackersFromMagnet(magnetUri: string): string[] {
  const trackers: string[] = [];
  const url = new URL(magnetUri);
  
  // Get all 'tr' parameters (tracker URLs)
  const trParams = url.searchParams.getAll('tr');
  for (const tr of trParams) {
    try {
      // Decode the tracker URL
      const decodedTr = decodeURIComponent(tr);
      trackers.push(decodedTr);
    } catch {
      // Skip invalid tracker URLs
    }
  }
  
  return trackers;
}

/**
 * GET /api/torrents/:id/swarm
 * Get realtime swarm statistics for a torrent
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // Get torrent by UUID or infohash
    const torrent = await getTorrent(id);

    if (!torrent) {
      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      );
    }

    // Extract trackers from magnet URI and combine with default scrape trackers
    const magnetTrackers = extractTrackersFromMagnet(torrent.magnet_uri);
    const allTrackers = [...new Set([...magnetTrackers, ...SCRAPE_TRACKERS])];

    // Scrape trackers for fresh swarm stats
    const swarmStats = await scrapeMultipleTrackers(allTrackers, torrent.infohash, {
      timeout: 5000,
      maxConcurrent: 5,
    });

    return NextResponse.json({
      seeders: swarmStats.seeders,
      leechers: swarmStats.leechers,
      fetchedAt: swarmStats.fetchedAt.toISOString(),
      trackersResponded: swarmStats.trackersResponded,
      trackersQueried: swarmStats.trackersQueried,
    });
  } catch (error) {
    console.error('Error fetching swarm stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch swarm stats' },
      { status: 500 }
    );
  }
}
