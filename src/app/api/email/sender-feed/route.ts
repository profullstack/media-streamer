import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { extractBearerToken, getCoinPayOAuthUserInfo } from '@/lib/coinpayportal';
import { getEmailAccount } from '@/lib/email-accounts';
import { getActiveProfileId, getProfilesService } from '@/lib/profiles';
import {
  buildPrivateSenderFeedUrl,
  buildPrivateSenderFeedXml,
  extractEmailAddress,
} from '@/lib/email-reader';
import { subscribeToRssFeed } from '@/lib/rss-reader';
import { createServerClient } from '@/lib/supabase';
import { isPaidSubscriptionActive } from '@/lib/subscription/check';

interface CreateSenderFeedRequest {
  accountId: string;
  sender: string;
  profileId?: string;
  subscribe?: boolean;
}

function isCreateSenderFeedRequest(body: unknown): body is CreateSenderFeedRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.accountId === 'string' &&
    typeof obj.sender === 'string' &&
    (obj.profileId === undefined || typeof obj.profileId === 'string') &&
    (obj.subscribe === undefined || typeof obj.subscribe === 'boolean')
  );
}

interface ProfileOwner {
  userId: string;
  email: string;
}

interface ProfileOwnerRow {
  account_id: string | null;
}

interface ProfileOwnerClient {
  from(table: 'profiles'): {
    select(columns: 'account_id'): {
      eq(column: 'id', value: string): {
        maybeSingle(): Promise<{
          data: ProfileOwnerRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
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

async function requireOwnedProfile(userId: string, profileId: string): Promise<Response | null> {
  const profile = await getProfilesService().getProfileById(userId, profileId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  return null;
}

async function getProfileOwner(profileId: string): Promise<ProfileOwner | null> {
  const supabase = createServerClient();
  const profileClient = supabase as unknown as ProfileOwnerClient;
  const { data: profile, error } = await profileClient
    .from('profiles')
    .select('account_id')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve profile owner: ${error.message}`);
  }

  if (!profile?.account_id) return null;

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(profile.account_id);
  if (userError || !userData.user?.email) {
    throw new Error(`Failed to resolve profile owner email: ${userError?.message ?? 'missing email'}`);
  }

  return {
    userId: profile.account_id,
    email: userData.user.email.trim().toLowerCase(),
  };
}

async function authenticateFeedOwner(request: NextRequest, owner: ProfileOwner): Promise<{
  userId: string;
  email: string;
  did: string | null;
  method: 'session' | 'coinpay_oauth';
} | null> {
  const sessionUser = await getAuthenticatedUser(request);
  if (sessionUser?.id === owner.userId) {
    return {
      userId: sessionUser.id,
      email: sessionUser.email.trim().toLowerCase(),
      did: null,
      method: 'session',
    };
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;

  const coinpayUser = await getCoinPayOAuthUserInfo(token);
  if (!coinpayUser?.email || coinpayUser.emailVerified === false) return null;

  if (coinpayUser.email.trim().toLowerCase() !== owner.email) {
    return null;
  }

  return {
    userId: owner.userId,
    email: owner.email,
    did: coinpayUser.did,
    method: 'coinpay_oauth',
  };
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
    const profileId = body.profileId?.trim() || await getActiveProfileId();
    if (!profileId) {
      return NextResponse.json({ error: 'Profile selection required' }, { status: 400 });
    }

    const profileError = await requireOwnedProfile(user.id, profileId);
    if (profileError) return profileError;

    const account = await getEmailAccount(user.id, body.accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    const feedUrl = buildPrivateSenderFeedUrl(requestOrigin(request), {
      profileId,
      accountId: account.id,
      senderEmail,
    });

    const subscription = body.subscribe
      ? await subscribeToRssFeed(profileId, feedUrl, false, {
          customTitle: `Email from ${senderEmail}`,
          folder: 'Email',
        })
      : null;

    return NextResponse.json({
      feedUrl,
      subscription,
    });
  } catch (error) {
    console.error('[EmailSenderFeed] Failed to create sender feed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create sender feed',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const profileId = request.nextUrl.searchParams.get('profileId');
  const accountId = request.nextUrl.searchParams.get('accountId');
  const sender = request.nextUrl.searchParams.get('sender');
  const senderEmail = extractEmailAddress(sender);

  if (!profileId || !accountId || !senderEmail) {
    return NextResponse.json({ error: 'Invalid private feed URL' }, { status: 400 });
  }

  const owner = await getProfileOwner(profileId);
  if (!owner) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const user = await authenticateFeedOwner(request, owner);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const paid = await isPaidSubscriptionActive(user.userId);
  if (!paid.active) {
    return NextResponse.json({ error: 'Paid subscription required' }, { status: 403 });
  }

  try {
    const account = await getEmailAccount(user.userId, accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    const xml = await buildPrivateSenderFeedXml(requestOrigin(request), account, profileId, senderEmail);
    return privateRssResponse(xml);
  } catch (error) {
    console.error('[EmailSenderFeed] Failed to render sender feed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to render sender feed',
    }, { status: 500 });
  }
}
