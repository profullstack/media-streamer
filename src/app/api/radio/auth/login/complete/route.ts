/**
 * POST /api/radio/auth/login/complete
 *
 * Body: { otp: string }
 *
 * Pops the pending login state (stashed by /start), redeems the OTP, and
 * persists the resulting authenticated session to Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { completeOtpLogin, SiriusXmAuthError } from '@/lib/radio/siriusxm-auth';
import { saveCredentials } from '@/lib/radio/siriusxm-credentials';
import { takePendingLogin } from '../start/pending-store';

interface Body {
  otp?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const otp = body.otp?.replace(/\s+/g, '');
  if (!otp) {
    return NextResponse.json({ error: 'OTP required' }, { status: 400 });
  }

  const pending = takePendingLogin(user.id);
  if (!pending) {
    return NextResponse.json(
      { error: 'No pending login. Send the email step first.' },
      { status: 400 }
    );
  }

  try {
    const session = await completeOtpLogin(
      {
        identityId: pending.identityId,
        anonAccessToken: pending.anonAccessToken,
        cookies: pending.cookies,
        proxySessionId: pending.proxySessionId,
      },
      otp
    );

    await saveCredentials({
      userId: user.id,
      email: pending.email,
      accessToken: session.accessToken,
      sessionCookies: session.cookies,
      accessTokenExpiresAt: session.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt ?? null,
    });

    return NextResponse.json({
      ok: true,
      email: pending.email,
      accessTokenExpiresAt: session.accessTokenExpiresAt ?? null,
    });
  } catch (error) {
    if (error instanceof SiriusXmAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status >= 400 && error.status < 500 ? error.status : 502 }
      );
    }
    console.error('[radio/auth/complete]', error);
    return NextResponse.json(
      { error: 'Failed to complete SiriusXM login' },
      { status: 500 }
    );
  }
}
