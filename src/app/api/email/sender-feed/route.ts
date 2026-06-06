import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailAccount } from '@/lib/email-accounts';
import {
  buildPrivateSenderFeedUrl,
  buildPrivateSenderFeedXml,
  extractEmailAddress,
  verifyPrivateSenderFeed,
} from '@/lib/email-reader';
import { getActiveProfileId } from '@/lib/profiles';
import { subscribeToRssFeed } from '@/lib/rss-reader';
import { isPaidSubscriptionActive } from '@/lib/subscription/check';

interface CreateSenderFeedRequest {
  accountId: string;
  sender: string;
  subscribe?: boolean;
}

function isCreateSenderFeedRequest(body: unknown): body is CreateSenderFeedRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.accountId === 'string' &&
    typeof obj.sender === 'string' &&
    (obj.subscribe === undefined || typeof obj.subscribe === 'boolean')
  );
}

function requestOrigin(request: NextRequest): string {
  return request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function privateRssResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const paid = await isPaidSubscriptionActive(user.id);
  if (!paid.active) {
    return NextResponse.json({
      error: 'Paid subscription required',
      message: 'Private sender RSS feeds require an active paid subscription.',
    }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isCreateSenderFeedRequest(body)) {
    return NextResponse.json({ error: 'Missing sender feed fields' }, { status: 400 });
  }

  const senderEmail = extractEmailAddress(body.sender);
  if (!senderEmail) {
    return NextResponse.json({ error: 'Sender email is required' }, { status: 400 });
  }

  try {
    const account = await getEmailAccount(user.id, body.accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    const feedUrl = buildPrivateSenderFeedUrl(requestOrigin(request), {
      userId: user.id,
      accountId: account.id,
      senderEmail,
    });

    let subscription: Awaited<ReturnType<typeof subscribeToRssFeed>> | null = null;
    let subscriptionError: string | null = null;

    if (body.subscribe !== false) {
      const profileId = await getActiveProfileId();
      if (profileId) {
        try {
          subscription = await subscribeToRssFeed(profileId, feedUrl, false, {
            customTitle: `Email from ${senderEmail}`,
            folder: 'Email',
          });
        } catch (error) {
          subscriptionError = error instanceof Error ? error.message : 'Failed to add feed to RSS Reader';
        }
      } else {
        subscriptionError = 'No active profile selected';
      }
    }

    return NextResponse.json({
      feedUrl,
      subscription,
      subscriptionError,
      warning: 'Keep this private feed URL secret. Anyone with the full URL can read matching email messages while your paid subscription is active.',
    });
  } catch (error) {
    console.error('[EmailSenderFeed] Failed to create sender feed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create sender feed',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const userId = request.nextUrl.searchParams.get('userId');
  const accountId = request.nextUrl.searchParams.get('accountId');
  const sender = request.nextUrl.searchParams.get('sender');
  const token = request.nextUrl.searchParams.get('token');
  const senderEmail = extractEmailAddress(sender);

  if (!userId || !accountId || !senderEmail || !token) {
    return NextResponse.json({ error: 'Invalid private feed URL' }, { status: 400 });
  }

  if (!verifyPrivateSenderFeed({ userId, accountId, senderEmail }, token)) {
    return NextResponse.json({ error: 'Invalid private feed token' }, { status: 403 });
  }

  const paid = await isPaidSubscriptionActive(userId);
  if (!paid.active) {
    return NextResponse.json({ error: 'Paid subscription required' }, { status: 403 });
  }

  try {
    const account = await getEmailAccount(userId, accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    const xml = await buildPrivateSenderFeedXml(requestOrigin(request), account, senderEmail);
    return privateRssResponse(xml);
  } catch (error) {
    console.error('[EmailSenderFeed] Failed to render sender feed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to render sender feed',
    }, { status: 500 });
  }
}
