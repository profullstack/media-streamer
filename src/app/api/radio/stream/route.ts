/**
 * Radio Stream API Route
 *
 * GET /api/radio/stream - Get streaming URLs for a station
 *
 * Query parameters:
 * - id: Station ID (required)
 * - quality: SiriusXM quality preference (optional, '256' | '128' | '64' | '32')
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRadioService, SiriusXmAuthError } from '@/lib/radio';
import type { SiriusXmQuality } from '@/lib/radio';

const VALID_QUALITIES: ReadonlyArray<SiriusXmQuality> = ['256', '128', '64', '32'];

function parseQuality(value: string | null): SiriusXmQuality | undefined {
  if (value && (VALID_QUALITIES as readonly string[]).includes(value)) {
    return value as SiriusXmQuality;
  }
  return undefined;
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('id');
  const quality = parseQuality(searchParams.get('quality'));

  if (!stationId || stationId.trim().length === 0) {
    return NextResponse.json(
      { error: 'Station ID is required' },
      { status: 400 }
    );
  }

  try {
    const service = getRadioService();
    const { streams, preferred } = await service.getStream(stationId.trim(), quality);

    if (streams.length === 0) {
      return NextResponse.json(
        { error: 'No streams available for this station' },
        { status: 404 }
      );
    }

    const station = await service.getStationInfo(stationId.trim());

    return NextResponse.json({
      station,
      streams,
      preferredStream: preferred,
    });
  } catch (error) {
    console.error('[Radio API] Stream error:', error);
    if (error instanceof SiriusXmAuthError) {
      return NextResponse.json(
        { error: error.message, code: 'SIRIUSXM_AUTH' },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to get station stream' },
      { status: 500 }
    );
  }
}
