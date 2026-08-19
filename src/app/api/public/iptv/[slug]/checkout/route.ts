/**
 * @route POST /api/public/iptv/[slug]/checkout — buy a pass.
 *
 * Sets the pass cookie at checkout. The cookie is useless until the webhook flips
 * the grant to paid, so handing it over before payment grants nothing.
 */

import { NextRequest, NextResponse } from 'next/server';

import { IptvResaleError, createCheckout } from '@/lib/iptv/shares';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as { blockchain?: string };

  try {
    const result = await createCheckout(slug, {
      blockchain: body.blockchain,
      fingerprint: request.headers.get('user-agent'),
      origin: new URL(request.url).origin,
    });

    const response = NextResponse.json(
      { paymentUrl: result.paymentUrl, grantId: result.grantId },
      { status: 200 }
    );
    response.cookies.set(result.cookie.name, result.cookie.value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (error) {
    if (error instanceof IptvResaleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
