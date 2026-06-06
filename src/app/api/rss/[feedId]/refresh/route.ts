import { NextRequest, NextResponse } from 'next/server';
import { getActiveProfileId } from '@/lib/profiles';
import { refreshRssFeed } from '@/lib/rss-reader';

interface RouteContext {
  params: Promise<{ feedId: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<Response> {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No profile selected' }, { status: 400 });
  }

  const { feedId } = await context.params;
  if (!feedId) {
    return NextResponse.json({ error: 'Missing feed id' }, { status: 400 });
  }

  try {
    const result = await refreshRssFeed(profileId, feedId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh RSS feed';
    const status = message.includes('not subscribed') || message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
