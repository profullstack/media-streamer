/**
 * GET    /api/v1/coinpay/connection  — is a CoinPay account connected
 * DELETE /api/v1/coinpay/connection  — disconnect it
 *
 * Every account here has an email and password, so disconnecting CoinPay
 * never removes the only way in.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isCoinpaySigninConfigured, supabaseCoinpayStore } from '@/lib/coinpay-signin';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const row = await supabaseCoinpayStore().byUser(user.id);
  return NextResponse.json({
    configured: isCoinpaySigninConfigured(),
    connected: Boolean(row),
    ...(row ? { connection: { name: row.name, email: row.email } } : {}),
  });
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gone = await supabaseCoinpayStore().unlink(user.id);
  return NextResponse.json({ success: true, disconnected: gone });
}
