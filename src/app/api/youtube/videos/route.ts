/**
 * GET /api/youtube/videos
 *
 * Query parameters:
 *   videoId    (required) YouTube video id
 *   accountId  (optional) which connected YouTube account to use;
 *              defaults to the user's `is_default` account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getAccountById, getVideoDetails, hasYouTubeSearchScope, listAccountsForUser } from '@/lib/youtube';
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
  const videoId = searchParams.get('videoId');
  const accountId = searchParams.get('accountId');

  if (!videoId || !videoId.trim()) {
    return NextResponse.json({ error: 'Missing required parameter: videoId' }, { status: 400 });
  }

  const resolved = await resolveAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeSearchScope(resolved.scopes)) {
    return reconnectResponse();
  }

  try {
    const video = await getVideoDetails(resolved, videoId.trim());
    if (!video) {
      return NextResponse.json({ error: 'video_not_found' }, { status: 404 });
    }
    return NextResponse.json({ video });
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      return reconnectResponse();
    }
    console.error('[YouTube] video details failed:', err);
    return NextResponse.json({ error: 'YouTube video details failed' }, { status: 502 });
  }
}
