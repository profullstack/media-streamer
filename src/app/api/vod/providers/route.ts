import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { VodError, createProvider, listProviders, type ProviderInput } from '@/lib/vod';

export const dynamic = 'force-dynamic';

/** GET — list the account's VOD providers. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const providers = await listProviders(user.id);
  return NextResponse.json({ providers }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

/** POST — connect a new VOD source. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as ProviderInput;
  try {
    const provider = await createProvider(user.id, body);
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    if (error instanceof VodError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
