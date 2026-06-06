import { NextRequest, NextResponse } from 'next/server';
import { getActiveProfileId } from '@/lib/profiles';
import {
  getRssReaderData,
  removeRssSubscription,
  subscribeToRssFeed,
  updateRssSubscription,
} from '@/lib/rss-reader';

interface SubscribeRequest {
  feedUrl: string;
  notifyNewItems?: boolean;
  customTitle?: string | null;
  folder?: string | null;
}

interface UpdateSubscriptionRequest {
  customTitle?: string | null;
  folder?: string | null;
  notifyNewItems?: boolean;
  isActive?: boolean;
}

function isSubscribeRequest(body: unknown): body is SubscribeRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.feedUrl === 'string' &&
    (obj.notifyNewItems === undefined || typeof obj.notifyNewItems === 'boolean') &&
    (obj.customTitle === undefined || obj.customTitle === null || typeof obj.customTitle === 'string') &&
    (obj.folder === undefined || obj.folder === null || typeof obj.folder === 'string')
  );
}

function isUpdateSubscriptionRequest(body: unknown): body is UpdateSubscriptionRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  const hasField = ['customTitle', 'folder', 'notifyNewItems', 'isActive'].some((field) => field in obj);
  return (
    hasField &&
    (obj.customTitle === undefined || obj.customTitle === null || typeof obj.customTitle === 'string') &&
    (obj.folder === undefined || obj.folder === null || typeof obj.folder === 'string') &&
    (obj.notifyNewItems === undefined || typeof obj.notifyNewItems === 'boolean') &&
    (obj.isActive === undefined || typeof obj.isActive === 'boolean')
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No profile selected' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');

  try {
    const data = await getRssReaderData(profileId, {
      feedId: searchParams.get('feedId') ?? undefined,
      unreadOnly: searchParams.get('unread') === 'true',
      savedOnly: searchParams.get('saved') === 'true',
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[RSS] Failed to load reader data:', error);
    return NextResponse.json({ error: 'Failed to load RSS reader data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
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

  if (!isSubscribeRequest(body)) {
    return NextResponse.json({ error: 'Missing required field: feedUrl' }, { status: 400 });
  }

  try {
    const subscription = await subscribeToRssFeed(
      profileId,
      body.feedUrl,
      body.notifyNewItems ?? false,
      {
        customTitle: body.customTitle,
        folder: body.folder,
      }
    );

    return NextResponse.json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to subscribe to RSS feed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No profile selected' }, { status: 400 });
  }

  const feedId = new URL(request.url).searchParams.get('feedId');
  if (!feedId) {
    return NextResponse.json({ error: 'Missing required parameter: feedId' }, { status: 400 });
  }

  try {
    await removeRssSubscription(profileId, feedId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RSS] Failed to unsubscribe:', error);
    return NextResponse.json({ error: 'Failed to unsubscribe from RSS feed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No profile selected' }, { status: 400 });
  }

  const feedId = new URL(request.url).searchParams.get('feedId');
  if (!feedId) {
    return NextResponse.json({ error: 'Missing required parameter: feedId' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isUpdateSubscriptionRequest(body)) {
    return NextResponse.json({ error: 'Invalid RSS subscription update' }, { status: 400 });
  }

  try {
    const subscription = await updateRssSubscription(profileId, feedId, {
      customTitle: body.customTitle,
      folder: body.folder,
      notifyNewItems: body.notifyNewItems,
      isActive: body.isActive,
    });
    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('[RSS] Failed to update subscription:', error);
    return NextResponse.json({ error: 'Failed to update RSS subscription' }, { status: 500 });
  }
}
