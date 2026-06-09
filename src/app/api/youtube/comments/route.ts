/**
 * GET  /api/youtube/comments - list top-level YouTube comments for a video
 * POST /api/youtube/comments - add a top-level YouTube comment
 *
 * Query parameters:
 *   videoId    (required for GET) YouTube video id
 *   accountId  (optional) which connected YouTube account to use;
 *              defaults to the user's `is_default` account.
 *   pageToken  (optional) YouTube pagination token
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import {
  addVideoComment,
  getAccountById,
  hasYouTubeCommentWriteScope,
  hasYouTubeSearchScope,
  listAccountsForUser,
  listVideoComments,
} from '@/lib/youtube';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';
import type { YouTubeAccount } from '@/lib/youtube';

function reconnectReadResponse(): Response {
  return NextResponse.json(
    {
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing YouTube comment read access. Reconnect it from Manage accounts, then try again.',
    },
    { status: 412 }
  );
}

function reconnectWriteResponse(): Response {
  return NextResponse.json(
    {
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing YouTube comment posting access. Reconnect it from Manage accounts, then try again.',
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
  const pageToken = searchParams.get('pageToken') ?? undefined;

  if (!videoId || !videoId.trim()) {
    return NextResponse.json({ error: 'Missing required parameter: videoId' }, { status: 400 });
  }

  const resolved = await resolveAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeSearchScope(resolved.scopes)) {
    return reconnectReadResponse();
  }

  try {
    const result = await listVideoComments(resolved, videoId.trim(), pageToken);
    return NextResponse.json(result);
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      return reconnectReadResponse();
    }
    console.error('[YouTube] comments failed:', err);
    return NextResponse.json({ error: 'YouTube comments failed' }, { status: 502 });
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
    videoId?: unknown;
    body?: unknown;
  };
  const accountId = typeof body.accountId === 'string' ? body.accountId : null;
  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  const commentBody = typeof body.body === 'string' ? body.body.trim() : '';

  if (!videoId) {
    return NextResponse.json({ error: 'Missing required body field: videoId' }, { status: 400 });
  }
  if (!commentBody) {
    return NextResponse.json({ error: 'Missing required body field: body' }, { status: 400 });
  }
  if (commentBody.length > 10_000) {
    return NextResponse.json({ error: 'Comment is too long' }, { status: 400 });
  }

  const resolved = await resolveAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeCommentWriteScope(resolved.scopes)) {
    return reconnectWriteResponse();
  }

  try {
    const comment = await addVideoComment(resolved, videoId, commentBody);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      return reconnectWriteResponse();
    }
    console.error('[YouTube] comment post failed:', err);
    return NextResponse.json({ error: 'YouTube comment post failed' }, { status: 502 });
  }
}
