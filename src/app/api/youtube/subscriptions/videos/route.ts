/**
 * GET /api/youtube/subscriptions/videos
 *
 * Query parameters:
 *   channelId  (required) subscribed channel id
 *   accountId  (optional) which connected YouTube account to use;
 *              defaults to the user's `is_default` account.
 *   pageToken  (optional) YouTube pagination token
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import {
  getAccountById,
  hasYouTubeSearchScope,
  listAccountsForUser,
  listRecentChannelVideos,
} from '@/lib/youtube';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';
import type { YouTubeAccount } from '@/lib/youtube';

function reconnectResponse(): Response {
  return NextResponse.json(
    {
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing YouTube read access. Reconnect it from Manage accounts, then try again.',
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

export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');
  const accountId = searchParams.get('accountId');
  const pageToken = searchParams.get('pageToken') ?? undefined;

  if (!channelId || !channelId.trim()) {
    return NextResponse.json({ error: 'Missing required parameter: channelId' }, { status: 400 });
  }

  const resolved = await resolveAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeSearchScope(resolved.scopes)) {
    return reconnectResponse();
  }

  try {
    const result = await listRecentChannelVideos(resolved, channelId.trim(), pageToken);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    if (
      message.includes('access_token_scope_insufficient') ||
      message.includes('insufficient authentication scopes') ||
      message.includes('insufficient permission') ||
      message.includes('insufficientpermissions')
    ) {
      return reconnectResponse();
    }
    console.error('[YouTube] subscription channel videos failed:', err);
    return NextResponse.json({ error: 'YouTube channel videos failed' }, { status: 502 });
  }
}
