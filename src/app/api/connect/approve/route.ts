/**
 * POST /api/connect/approve
 *
 * Final step of the TronBrowser connect flow. Verifies the signed-in user,
 * mints an API token, and redirects to the (validated) callback with the token
 * in the URL fragment: <redirect>#token=btr_...
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createApiToken, isAllowedConnectRedirect } from '@/lib/api-tokens';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const redirectTo = String(form?.get('redirect') || '');

  if (!isAllowedConnectRedirect(redirectTo)) {
    return NextResponse.json({ error: 'invalid redirect' }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    // Session expired between consent render and submit — bounce through login.
    const next = `/connect?redirect=${encodeURIComponent(redirectTo)}`;
    return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(next)}`, request.url));
  }

  const token = await createApiToken(user.id, 'TronBrowser');
  const sep = redirectTo.includes('#') ? '&' : '#';
  return NextResponse.redirect(`${redirectTo}${sep}token=${encodeURIComponent(token)}`, 303);
}
