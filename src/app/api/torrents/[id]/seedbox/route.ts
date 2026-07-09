import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  getSeedboxAccess,
  getSeedboxConfig,
  isEmailAllowed,
  isValidMagnet,
  sendTorrentToSeedbox,
  type SeedboxTransport,
} from '@/lib/seedbox';

interface SendToSeedboxBody {
  magnet?: unknown;
  name?: unknown;
  transport?: unknown;
}

function isTransport(value: unknown): value is SeedboxTransport {
  return value === 'http' || value === 'ssh';
}

/**
 * GET — report what the current user can do with the seedbox (which transports
 * are configured + the public key to authorize for SSH). Used by the UI to
 * decide whether to show the "Send to seedbox" controls.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  const access = await getSeedboxAccess(user?.email);
  return NextResponse.json(access, { status: 200 });
}

/**
 * POST — push a magnet to the seedbox over the chosen transport. Gated to the
 * allowlisted operator emails (fails closed).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const config = getSeedboxConfig();
  if (!isEmailAllowed(config, user.email)) {
    return NextResponse.json({ error: 'Seedbox access is not enabled for this account' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as SendToSeedboxBody;
  if (!isValidMagnet(body.magnet)) {
    return NextResponse.json({ error: 'A valid magnet link is required' }, { status: 400 });
  }

  const transport = isTransport(body.transport) ? body.transport : undefined;
  const name = typeof body.name === 'string' ? body.name : '';

  const result = await sendTorrentToSeedbox(body.magnet.trim(), name, transport, config);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, transport: result.transport }, { status: 502 });
  }

  return NextResponse.json({ success: true, transport: result.transport, message: result.message }, { status: 200 });
}
