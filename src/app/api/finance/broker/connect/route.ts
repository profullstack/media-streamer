/**
 * Read-only brokerage connection (PRD §3.4, §5).
 *
 * GET    /api/finance/broker/connect          — list connections (no secrets)
 * POST   /api/finance/broker/connect          — verify + store encrypted creds + initial sync
 * DELETE /api/finance/broker/connect?id=       — disconnect + purge holdings
 *
 * Paid-gated. Credentials are read-only scope; secrets are never returned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { SUPPORTED_BROKERS } from '@/lib/finance/brokers';
import { connectBroker, disconnectBroker, listConnections } from '@/lib/finance/brokers/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  return NextResponse.json({ connections: await listConnections(profileId), supported: SUPPORTED_BROKERS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as {
    provider?: string;
    apiKey?: string;
    apiSecret?: string;
    paper?: boolean;
    label?: string;
  } | null;

  const provider = body?.provider?.trim() ?? '';
  const apiKey = body?.apiKey?.trim() ?? '';
  const apiSecret = body?.apiSecret?.trim() ?? '';

  if (!SUPPORTED_BROKERS.includes(provider)) {
    return NextResponse.json({ error: 'unsupported provider' }, { status: 400 });
  }
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'apiKey and apiSecret are required' }, { status: 400 });
  }

  const result = await connectBroker(
    profileId,
    provider,
    { apiKey, apiSecret, paper: body?.paper === true },
    body?.label?.trim() || null,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ connection: result.connection }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const ok = await disconnectBroker(profileId, id);
  if (!ok) return NextResponse.json({ error: 'failed to disconnect' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
