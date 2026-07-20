import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { RentalError, createCheckout } from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

// Cookie lifetime is a generous outer bound; the real gate is the grant's
// paid-status + expires_at (enforced on every request), not the cookie.
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/** Best-effort viewer fingerprint for abuse limits (never used for identity). */
function fingerprint(request: NextRequest): string | null {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '';
  const ua = request.headers.get('user-agent') || '';
  if (!ip && !ua) return null;
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

/**
 * POST — start a $0.25 checkout. Creates a pending session pass, opens a
 * CoinPay hosted payment, and sets the (httpOnly) pass cookie. The cookie is
 * inert until the webhook confirms payment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as { blockchain?: string };

  try {
    const result = await createCheckout(slug, {
      blockchain: body.blockchain,
      fingerprint: fingerprint(request),
      origin: request.nextUrl.origin,
    });

    const response = NextResponse.json(
      { paymentUrl: result.paymentUrl, grantId: result.grantId },
      { status: 200 }
    );
    response.cookies.set(result.cookie.name, result.cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  } catch (error) {
    if (error instanceof RentalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
