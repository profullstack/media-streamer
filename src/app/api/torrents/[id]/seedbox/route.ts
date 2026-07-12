import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  getSeedboxAccess,
  hasSeedbox,
  isValidMagnet,
  loadAccountSeedboxConfig,
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
 * GET — report what the current account can do with its connected seedbox (which
 * transports are configured + the SSH public key). Used by the UI to decide
 * whether to show the "Send to seedbox" controls. The config is per-account and
 * shared to every profile under it; a logged-out user simply gets nothing.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  const config = user ? await loadAccountSeedboxConfig(user.id) : null;
  const access = await getSeedboxAccess(config);
  return NextResponse.json(access, { status: 200 });
}

/**
 * POST — push a magnet to the account's seedbox over the chosen transport.
 * Requires the account to have connected a seedbox (fails closed otherwise).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const config = await loadAccountSeedboxConfig(user.id);
  if (!hasSeedbox(config)) {
    return NextResponse.json(
      { error: 'No seedbox is connected. Add one in Settings → Seedbox.' },
      { status: 403 }
    );
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
