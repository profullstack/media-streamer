/**
 * News TTS Audio Serving Route
 *
 * Serves cached TTS audio from Redis by hash.
 * No authentication required - audio URLs are unguessable due to SHA256 hash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNewsTTSCache } from '@/lib/news/tts-cache';

interface RouteParams {
  params: Promise<{ hash: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { hash } = await params;

  // Validate hash format (should be 16 hex characters)
  if (!/^[a-f0-9]{16}$/i.test(hash)) {
    return NextResponse.json(
      { error: 'Invalid audio ID' },
      { status: 400 }
    );
  }

  try {
    const ttsCache = getNewsTTSCache();
    const audioData = await ttsCache.getByHash(hash);

    if (!audioData) {
      return NextResponse.json(
        { error: 'Audio not found' },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(audioData), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.length.toString(),
        'Cache-Control': 'public, max-age=28800', // 8 hours (same as Redis TTL)
      },
    });
  } catch (error) {
    console.error('[TTS Audio] Error serving audio:', error);
    return NextResponse.json(
      { error: 'Failed to serve audio' },
      { status: 500 }
    );
  }
}
