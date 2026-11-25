/**
 * POST /api/account/seedbox/connect-code {code, name?}
 *
 * Adds a box that already runs torlink, from the code our installer prints
 * (/torlink/install.sh, or `c0mpute plugin install torlink` on a c0mpute node). No SSH:
 * the code carries the box's address, its two ports and the access token made on it.
 * The box becomes a seedbox on the account and is managed from /seedboxes like any
 * other. The token is sealed in the member's vault with the rest of the config.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { createSeedbox } from '@/lib/seedbox';
import { baseUrl, parseConnectCode } from '@/lib/seedbox/local-install';
import { withVaultErrors } from '@/lib/vault/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { code?: unknown; name?: unknown };
  const parsed = parseConnectCode(body.code);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { host, servePort, filesPort, token, name } = parsed.code;

  const label = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : (name ?? host);
  const summary = await createSeedbox(user.id, {
    name: label,
    http: { baseUrl: baseUrl(host, servePort), token, addPath: '/add', auth: 'bearer', magnetField: 'magnet' },
    files: { baseUrl: baseUrl(host, filesPort), auth: 'bearer', token },
  });
  return NextResponse.json({ success: true, id: summary.id, summary }, { status: 201 });
}

export const POST = withVaultErrors(handlePOST);
