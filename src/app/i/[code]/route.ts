/**
 * /i/<code>: the short invite link (src/lib/invites.ts inviteLink()).
 *
 * Sends the visitor to sign up with the code filled in. The code rides in the URL, not a cookie,
 * so it survives a different browser or an email client's in-app browser. A malformed code goes
 * to the invite-only screen. Open while signed out: listed in site-offline.ts, proxy.ts
 * PUBLIC_PATHS and legal-mode.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { formatInviteCode, isInviteCodeShape, normalizeInviteCode } from '@/lib/invites';

export const dynamic = 'force-dynamic';

/** The public origin: behind nginx, request.url is the container's localhost:3000. */
function origin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const { code: raw } = await params;
  const code = normalizeInviteCode(decodeURIComponent(raw ?? ''));
  const target = new URL(isInviteCodeShape(code) ? '/signup' : '/invite-only', origin(request));
  if (isInviteCodeShape(code)) target.searchParams.set('invite', formatInviteCode(code));
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && /^[a-zA-Z0-9_-]{1,64}$/.test(ref)) target.searchParams.set('ref', ref);
  return NextResponse.redirect(target, { status: 307, headers: { 'cache-control': 'no-store' } });
}
