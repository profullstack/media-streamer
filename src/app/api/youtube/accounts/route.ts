/**
 * GET    /api/youtube/accounts            - list connected YouTube accounts
 * DELETE /api/youtube/accounts?id=<uuid>  - disconnect an account
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { deleteAccount, listAccountsForUser, toPublicAccount } from '@/lib/youtube';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';

export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const accounts = await listAccountsForUser(userId);
    return NextResponse.json({ accounts: accounts.map(toPublicAccount) });
  } catch (err) {
    console.error('[YouTube] Failed to list accounts:', err);
    return NextResponse.json({ error: 'Failed to list accounts' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 });
  }

  try {
    await deleteAccount(userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[YouTube] Failed to delete account:', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
