/**
 * GET /api/youtube/search
 *
 * Query parameters:
 *   q          (required) search query
 *   pageToken  (optional) YouTube pagination token
 *   accountId  (optional) which connected YouTube account to use;
 *              defaults to the user's `is_default` account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getAccountById, hasYouTubeSearchScope, listAccountsForUser, searchVideos } from '@/lib/youtube';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';

function reconnectResponse(): Response {
  return NextResponse.json(
    {
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing search permission. Reconnect it from Manage accounts, then try again.',
    },
    { status: 412 }
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
  const query = searchParams.get('q');
  const pageToken = searchParams.get('pageToken') ?? undefined;
  const accountId = searchParams.get('accountId');

  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'Missing required parameter: q' }, { status: 400 });
  }

  // Resolve account: explicit id, else default, else first, else 404.
  let account = null;
  if (accountId) {
    account = await getAccountById(userId, accountId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
  } else {
    const accounts = await listAccountsForUser(userId);
    account = accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;
    if (!account) {
      return NextResponse.json(
        { error: 'no_connected_account', message: 'Connect a YouTube account first.' },
        { status: 412 }
      );
    }
  }

  if (!hasYouTubeSearchScope(account.scopes)) {
    return reconnectResponse();
  }

  try {
    const result = await searchVideos(account, query.trim(), pageToken);
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
    console.error('[YouTube] search failed:', err);
    return NextResponse.json({ error: 'YouTube search failed' }, { status: 502 });
  }
}
