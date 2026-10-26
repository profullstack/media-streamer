/**
 * POST /api/account/redeem  { code: "BT-XXXX-XXXX-XXXX-XXXX" }
 *
 * Redeem a credit code for days of Premium (src/lib/rewards.ts). Signed-in members only.
 * 200 { ok: true, days, expiresAt }   400 { ok: false, reason, error }   401 sign in.
 * Codes are 80 random bits and one redemption per member per code, so guessing is hopeless;
 * the site-wide throttle in src/proxy.ts still applies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getServerClient } from '@/lib/supabase';
import { PREMIUM_DAYS, getCredits, redeemMessage } from '@/lib/rewards';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers: NO_STORE });

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code || code.length > 64) {
    return NextResponse.json({ ok: false, reason: 'invalid', error: 'Enter a code' }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await getCredits().redeem(code, user.id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, reason: result.reason, error: redeemMessage(result.reason) },
        { status: 400, headers: NO_STORE }
      );
    }
    const { data } = await getServerClient()
      .from('user_subscriptions')
      .select('tier, subscription_expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    return NextResponse.json(
      {
        ok: true,
        unit: result.grant.unit,
        days: result.grant.unit === PREMIUM_DAYS ? result.grant.amount : 0,
        tier: data?.tier ?? null,
        expiresAt: data?.subscription_expires_at ?? null,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('[Redeem] failed:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: 'Could not redeem that code. Try again, or write to support@profullstack.com.' },
      { status: 500, headers: NO_STORE }
    );
  }
}
