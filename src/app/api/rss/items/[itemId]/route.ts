import { NextRequest, NextResponse } from 'next/server';
import { getActiveProfileId } from '@/lib/profiles';
import { setRssItemState } from '@/lib/rss-reader';

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

interface UpdateItemStateRequest {
  isRead?: boolean;
  isSaved?: boolean;
}

function isUpdateItemStateRequest(body: unknown): body is UpdateItemStateRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  const hasState = 'isRead' in obj || 'isSaved' in obj;
  return (
    hasState &&
    (obj.isRead === undefined || typeof obj.isRead === 'boolean') &&
    (obj.isSaved === undefined || typeof obj.isSaved === 'boolean')
  );
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
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

  if (!isUpdateItemStateRequest(body)) {
    return NextResponse.json({ error: 'Expected isRead or isSaved boolean' }, { status: 400 });
  }

  const { itemId } = await context.params;
  if (!itemId) {
    return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
  }

  try {
    const state = await setRssItemState(profileId, itemId, body);
    return NextResponse.json({
      itemId: state.item_id,
      isRead: state.is_read,
      isSaved: state.is_saved,
      readAt: state.read_at,
      savedAt: state.saved_at,
    });
  } catch (error) {
    console.error('[RSS] Failed to update item state:', error);
    return NextResponse.json({ error: 'Failed to update RSS item state' }, { status: 500 });
  }
}
