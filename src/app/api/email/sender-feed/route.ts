import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailAccount } from '@/lib/email-accounts';
import { createServerClient } from '@/lib/supabase';
import {
  buildPrivateSenderFeedUrl,
  buildPrivateSenderFeedXml,
  extractEmailAddress,
} from '@/lib/email-reader';
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
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || 'http://localhost:3000';
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

function unauthorizedFeedResponse(): Response {
  return NextResponse.json(
    { error: 'Authentication required' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="BitTorrented RSS", charset="UTF-8"',
      },
    }
  );
}

function parseBasicAuth(request: NextRequest): { email: string; password: string } | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('basic ')) return null;

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator <= 0) return null;
    const email = decoded.slice(0, separator).trim().toLowerCase();
    const password = decoded.slice(separator + 1);
    if (!email || !password) return null;
    return { email, password };
  } catch {
    return null;
  }
}

async function authenticateFeedRequest(request: NextRequest): Promise<string | null> {
  const cookieUser = await getAuthenticatedUser(request);
  if (cookieUser) return cookieUser.id;

  const credentials = parseBasicAuth(request);
  if (!credentials) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.user) return null;
  return data.user.id;
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
      accountId: account.id,
      senderEmail,
    });

    return NextResponse.json({
      feedUrl,
      auth: 'basic',
      warning: 'Add this feed URL to an RSS reader using your BitTorrented email and password.',
    });
  } catch (error) {
    console.error('[EmailSenderFeed] Failed to create sender feed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create sender feed',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const accountId = request.nextUrl.searchParams.get('accountId');
  const sender = request.nextUrl.searchParams.get('sender');
  const senderEmail = extractEmailAddress(sender);

  if (!accountId || !senderEmail) {
    return NextResponse.json({ error: 'Invalid private feed URL' }, { status: 400 });
  }

  const userId = await authenticateFeedRequest(request);
  if (!userId) {
    return unauthorizedFeedResponse();
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
