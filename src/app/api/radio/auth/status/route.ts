/**
 * GET /api/radio/auth/status
 *
 * Reports whether the current user has a SiriusXM session connected.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCredentials } from '@/lib/radio/siriusxm-credentials';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const creds = await getCredentials(user.id);
    if (!creds) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({
      connected: true,
      email: creds.email,
      accessTokenExpiresAt: creds.accessTokenExpiresAt,
      refreshTokenExpiresAt: creds.refreshTokenExpiresAt,
    });
  } catch (error) {
    console.error('[radio/auth/status]', error);
    return NextResponse.json(
      { error: 'Failed to load SiriusXM status' },
      { status: 500 }
    );
  }
}
