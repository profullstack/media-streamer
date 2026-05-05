/**
 * POST /api/radio/auth/login/start
 *
 * Body: { email: string }
 *
 * Walks the first 3 SiriusXM steps (anonymous session, identity status,
 * otp/initiate). Stashes the in-flight cookie jar + identity in an in-memory
 * map keyed by userId; the user has 10 minutes to call /complete with the OTP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { startOtpLogin, SiriusXmAuthError } from '@/lib/radio/siriusxm-auth';
import { putPendingLogin } from './pending-store';

interface Body {
  email?: string;
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

  const email = body.email?.trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  try {
    const state = await startOtpLogin(email);
    putPendingLogin(user.id, { ...state, email });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SiriusXmAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status >= 400 && error.status < 500 ? error.status : 502 }
      );
    }
    console.error('[radio/auth/start]', error);
    return NextResponse.json(
      { error: 'Failed to start SiriusXM login' },
      { status: 500 }
    );
  }
}
