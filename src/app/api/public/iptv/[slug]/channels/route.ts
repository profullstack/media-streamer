/**
 * @route GET /api/public/iptv/[slug]/channels — what this pass may watch.
 *
 * Requires a paid pass, and strips every channel's upstream `url` before it leaves
 * the server. A buyer picks a channel by id; only the server ever knows where that
 * id actually points.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  IptvResaleError,
  iptvPassCookieName,
  publicChannels,
  resolvePass,
  resolveShareChannels,
} from '@/lib/iptv/shares';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const cookie = request.cookies.get(iptvPassCookieName(slug))?.value;

  const pass = await resolvePass(slug, cookie);
  if (!pass.ok) return NextResponse.json({ error: pass.message }, { status: pass.status });

  try {
    const channels = await resolveShareChannels(pass.share);
    return NextResponse.json(
      { channels: publicChannels(channels) },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof IptvResaleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Could not load channels' }, { status: 500 });
  }
}
