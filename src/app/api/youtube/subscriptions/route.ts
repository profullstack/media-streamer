/**
 * GET /api/youtube/subscriptions
 *
 * Query parameters:
 *   accountId  (optional) which connected YouTube account to use;
 *              defaults to the user's `is_default` account.
 *   pageToken  (optional) YouTube pagination token
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import {
  getAccountById,
  hasYouTubeSearchScope,
  hasYouTubeSubscriptionManageScope,
  listAccountsForUser,
  listSubscribedChannels,
  subscribeToChannel,
  unsubscribeFromChannel,
} from '@/lib/youtube';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';
import type { YouTubeAccount } from '@/lib/youtube';

function reconnectResponse(): Response {
  return NextResponse.json(
    {
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing subscription access. Reconnect it from Manage accounts, then try again.',
    },
    { status: 412 }
  );
}

function reconnectManageResponse(): Response {
  return NextResponse.json(
    {
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing subscription management access. Reconnect it from Manage accounts, then try again.',
    },
    { status: 412 }
  );
}

async function resolveAccount(userId: string, accountId: string | null): Promise<YouTubeAccount | Response> {
  if (accountId) {
    const account = await getAccountById(userId, accountId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    return account;
  }

  const accounts = await listAccountsForUser(userId);
  const account = accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;
  if (!account) {
    return NextResponse.json(
      { error: 'no_connected_account', message: 'Connect a YouTube account first.' },
      { status: 412 }
    );
  }
  return account;
}

function isResponse(value: YouTubeAccount | Response): value is Response {
  return value instanceof Response;
}

function isInsufficientScopeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('access_token_scope_insufficient') ||
    message.includes('insufficient authentication scopes') ||
    message.includes('insufficient permission') ||
    message.includes('insufficientpermissions')
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');
  const pageToken = searchParams.get('pageToken') ?? undefined;

  const resolved = await resolveAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeSearchScope(resolved.scopes)) {
    return reconnectResponse();
  }

  try {
    const result = await listSubscribedChannels(resolved, pageToken);
    return NextResponse.json(result);
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      return reconnectResponse();
    }
    console.error('[YouTube] subscriptions failed:', err);
    return NextResponse.json({ error: 'YouTube subscriptions failed' }, { status: 502 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    accountId?: unknown;
    channelId?: unknown;
  };
  const accountId = typeof body.accountId === 'string' ? body.accountId : null;
  const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';

  if (!channelId) {
    return NextResponse.json({ error: 'Missing required body field: channelId' }, { status: 400 });
  }

  const resolved = await resolveAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeSubscriptionManageScope(resolved.scopes)) {
    return reconnectManageResponse();
  }

  try {
    const result = await subscribeToChannel(resolved, channelId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      return reconnectManageResponse();
    }
    console.error('[YouTube] subscribe failed:', err);
    return NextResponse.json({ error: 'YouTube subscribe failed' }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    accountId?: unknown;
    subscriptionId?: unknown;
    channelId?: unknown;
  };
  const accountId =
    (typeof body.accountId === 'string' ? body.accountId : null) ?? searchParams.get('accountId');
  const subscriptionId =
    (typeof body.subscriptionId === 'string' ? body.subscriptionId : null) ?? searchParams.get('subscriptionId') ?? undefined;
  const channelId =
    (typeof body.channelId === 'string' ? body.channelId.trim() : '') ||
    searchParams.get('channelId')?.trim() ||
    undefined;

  if (!subscriptionId && !channelId) {
    return NextResponse.json(
      { error: 'Missing required body field: subscriptionId or channelId' },
      { status: 400 }
    );
  }

  const resolved = await resolveAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeSubscriptionManageScope(resolved.scopes)) {
    return reconnectManageResponse();
  }

  try {
    const result = await unsubscribeFromChannel(resolved, { subscriptionId, channelId });
    return NextResponse.json(result);
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      return reconnectManageResponse();
    }
    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 });
    }
    console.error('[YouTube] unsubscribe failed:', err);
    return NextResponse.json({ error: 'YouTube unsubscribe failed' }, { status: 502 });
  }
}
