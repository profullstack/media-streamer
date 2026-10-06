/**
 * POST /api/cast/token
 *
 * Mints a short-lived cast token for the signed-in viewer, so a Chromecast
 * (which carries none of their cookies) can fetch the stream they chose to
 * cast. See src/lib/cast/token.ts for what the token can and cannot open.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { CAST_TOKEN_PARAM, createCastToken } from '@/lib/cast/token';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const { token, expiresAt } = await createCastToken(user.id);
    return NextResponse.json(
      { token, param: CAST_TOKEN_PARAM, expiresAt },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[cast] token mint failed:', error);
    return NextResponse.json({ error: 'Casting is not configured on this server' }, { status: 503 });
  }
}
