/**
 * Viewing sessions — the concurrency cap in practice.
 *
 * @route POST   /api/public/iptv/[slug]/session — start (or resume) watching a channel
 * @route PATCH  /api/public/iptv/[slug]/session — heartbeat
 * @route DELETE /api/public/iptv/[slug]/session — stop watching
 *
 * The player must heartbeat. A viewer who closes the tab never sends DELETE, and
 * without the heartbeat their slot would be held until the pass expired, leaving the
 * owner's line looking permanently full.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  IptvResaleError,
  heartbeat,
  iptvPassCookieName,
  startStream,
  stopStream,
} from '@/lib/iptv/shares';

export const dynamic = 'force-dynamic';

function fail(error: unknown): NextResponse {
  if (error instanceof IptvResaleError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const detail = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: detail }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const cookie = request.cookies.get(iptvPassCookieName(slug))?.value;
  const body = (await request.json().catch(() => ({}))) as { channelId?: string };
  if (!body.channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 });

  try {
    const session = await startStream(slug, cookie, body.channelId);
    // The stream is addressed by session id. The upstream URL is never sent.
    return NextResponse.json(
      { ...session, streamUrl: `/api/public/iptv/${slug}/stream?session=${session.sessionId}` },
      { status: 201 }
    );
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const cookie = request.cookies.get(iptvPassCookieName(slug))?.value;
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  try {
    await heartbeat(slug, cookie, body.sessionId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const cookie = request.cookies.get(iptvPassCookieName(slug))?.value;
  const sessionId = new URL(request.url).searchParams.get('session');
  if (!sessionId) return NextResponse.json({ error: 'session is required' }, { status: 400 });
  try {
    await stopStream(slug, cookie, sessionId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}
