/**
 * Radio Stream API Route
 *
 * GET /api/radio/stream - Get streaming URLs for a station
 *
 * Query parameters:
 * - id: Station ID (TuneIn GuideId, required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRadioService } from '@/lib/radio';

/**
 * GET /api/radio/stream?id=<stationId>
 *
 * Get streaming URLs for a radio station. No authentication required.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('id');

  if (!stationId || stationId.trim().length === 0) {
    return NextResponse.json(
      { error: 'Station ID is required' },
      { status: 400 }
    );
  }

  try {
    const service = getRadioService();

    // Get stream URLs
    const { streams, preferred } = await service.getStream(stationId.trim());

    if (streams.length === 0) {
      return NextResponse.json(
        { error: 'No streams available for this station' },
        { status: 404 }
      );
    }

    // Optionally get station info for additional metadata
    const station = await service.getStationInfo(stationId.trim());

    return NextResponse.json({
      station,
      streams,
      preferredStream: preferred,
    });
  } catch (error) {
    console.error('[Radio API] Stream error:', error);
    return NextResponse.json(
      { error: 'Failed to get station stream' },
      { status: 500 }
    );
  }
}
