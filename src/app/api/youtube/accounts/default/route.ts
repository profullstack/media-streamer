/**
 * POST /api/youtube/accounts/default
 *
 * Body: { id: string }
 * Sets the given YouTube account as the user's default.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getAccountById, setDefaultAccount } from '@/lib/youtube';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';

interface SetDefaultBody {
  id: string;
}

function isSetDefaultBody(b: unknown): b is SetDefaultBody {
  return (
    typeof b === 'object' &&
    b !== null &&
    typeof (b as Record<string, unknown>).id === 'string'
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isSetDefaultBody(body)) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const existing = await getAccountById(userId, body.id);
  if (!existing) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  try {
    await setDefaultAccount(userId, body.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[YouTube] Failed to set default account:', err);
    return NextResponse.json({ error: 'Failed to set default account' }, { status: 500 });
  }
}
