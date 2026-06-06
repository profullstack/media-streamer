import { NextResponse } from 'next/server';
import { getActiveProfileId } from '@/lib/profiles';
import { exportOpmlFeeds } from '@/lib/rss-reader';

export async function GET(): Promise<Response> {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No profile selected' }, { status: 400 });
  }

  try {
    const opml = await exportOpmlFeeds(profileId);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(opml, {
      status: 200,
      headers: {
        'Content-Type': 'text/x-opml; charset=utf-8',
        'Content-Disposition': `attachment; filename="bittorrented-rss-${date}.opml"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[RSS] Failed to export OPML:', error);
    return NextResponse.json({ error: 'Failed to export OPML' }, { status: 500 });
  }
}
