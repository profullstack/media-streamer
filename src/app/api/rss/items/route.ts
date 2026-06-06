import { NextRequest, NextResponse } from 'next/server';
import { getActiveProfileId } from '@/lib/profiles';
import { setRssItemsReadState } from '@/lib/rss-reader';

interface BulkReadStateRequest {
  feedId?: string | null;
  isRead: boolean;
}

function isBulkReadStateRequest(body: unknown): body is BulkReadStateRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.isRead === 'boolean' &&
    (obj.feedId === undefined || obj.feedId === null || typeof obj.feedId === 'string')
  );
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No profile selected' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isBulkReadStateRequest(body)) {
    return NextResponse.json({ error: 'Expected isRead boolean and optional feedId' }, { status: 400 });
  }

  try {
    const result = await setRssItemsReadState(profileId, {
      feedId: body.feedId ?? null,
      isRead: body.isRead,
    });

    return NextResponse.json({
      feedId: body.feedId ?? null,
      isRead: body.isRead,
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    console.error('[RSS] Failed to update bulk read state:', error);
    return NextResponse.json({ error: 'Failed to update RSS read state' }, { status: 500 });
  }
}
