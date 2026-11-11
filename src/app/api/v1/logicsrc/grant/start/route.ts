/**
 * GET /api/v1/logicsrc/grant/start?keys=ALPACA_API_KEY,ALPACA_API_SECRET&next=/settings?tab=vault
 *
 * "Get from logicsrc": records a grant request for the signed-in member and
 * sends them to logicsrc to approve it (303). The keys arrive later, sealed to
 * their key vault, at /api/v1/logicsrc/webhook. Signed out: to /login and back.
 * Refusals come back to the key vault page as ?logicsrc=<code>.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { KEYS_PAGE, keyGrants, siteOrigin } from '@/lib/logicsrc/grants';
import { SUPPORTED_KEYS } from '@/lib/logicsrc/inbox';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';

export const dynamic = 'force-dynamic';

function back(code: string): Response {
  const u = new URL(KEYS_PAGE, siteOrigin());
  u.searchParams.set('logicsrc', code);
  return new Response(null, { status: 303, headers: { location: u.toString(), 'cache-control': 'no-store' } });
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const user = await getCurrentUser();
  if (!user) {
    const login = new URL('/login', siteOrigin());
    login.searchParams.set('redirect', `${url.pathname}${url.search}`);
    return NextResponse.redirect(login, 303);
  }

  const keys = url.searchParams.get('keys') ?? SUPPORTED_KEYS.join(',');
  const names = keys.split(/[,\s]+/).filter(Boolean);
  if (names.some((n) => !SUPPORTED_KEYS.includes(n))) return back('bad_key');

  // Broker keys belong to a finance profile: the one the member is using now.
  const profileId = await getActiveProfileId();
  if (!profileId) return back('needs_profile');

  return keyGrants().startResponse({
    userId: user.id,
    keys: names,
    next: url.searchParams.get('next') ?? KEYS_PAGE,
    scope: profileId,
    errorPath: KEYS_PAGE,
  });
}
