import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { mintOwnerPass } from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

// Owners never pay to use their own seedbox. When the logged-in owner opens
// their own /rent link, the page calls this to mint a free session pass (sets
// the same httpOnly pass cookie) instead of showing the paywall.
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { slug } = await params;
  const pass = await mintOwnerPass(slug, user.id);
  if (!pass) {
    return NextResponse.json({ error: 'Not the owner of this rental' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, grantId: pass.grantId }, { status: 200 });
  response.cookies.set(pass.cookie.name, pass.cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
