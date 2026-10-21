import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { passesReturningTo, RETURN_PATH, speechErrorResponse } from '@/lib/translate';

// Buy a translated audio pass: a CoinPay hosted checkout session (any coin or
// PayPal), filed under the buyer's account id and email; idempotent on requestKey.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'Sign in to buy translated audio.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { plan, coin, requestKey, returnTo } = body;
  if (typeof plan !== 'string' || typeof requestKey !== 'string') {
    return Response.json({ error: 'Choose a translation pass.' }, { status: 400 });
  }
  if (!user.email) {
    return Response.json({ error: 'Add an email address to your account before buying a pass.' }, { status: 400 });
  }
  const back = typeof returnTo === 'string' && RETURN_PATH.test(returnTo) ? returnTo : '/vod';
  try {
    // `coin` is only sent by an older open tab; the session lets the buyer pick.
    return Response.json(
      await passesReturningTo(back).checkout(user.id, plan, typeof coin === 'string' ? coin : '', requestKey, {
        email: user.email,
        accountId: user.id,
      })
    );
  } catch (error) {
    return speechErrorResponse(error);
  }
}
