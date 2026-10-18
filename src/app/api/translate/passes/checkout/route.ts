import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { passesReturningTo, RETURN_PATH, speechErrorResponse } from '@/lib/translate';

// Buy a translated audio pass: a CoinPay invoice, idempotent on requestKey.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'Sign in to buy translated audio.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { plan, coin, requestKey, returnTo } = body;
  if (typeof plan !== 'string' || typeof coin !== 'string' || typeof requestKey !== 'string') {
    return Response.json({ error: 'Choose a translation pass and payment currency.' }, { status: 400 });
  }
  const back = typeof returnTo === 'string' && RETURN_PATH.test(returnTo) ? returnTo : '/vod';
  try {
    return Response.json(await passesReturningTo(back).checkout(user.id, plan, coin, requestKey));
  } catch (error) {
    return speechErrorResponse(error);
  }
}
