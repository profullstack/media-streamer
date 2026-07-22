import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { VodError, deleteProvider, getProvider, updateProvider, type ProviderInput } from '@/lib/vod';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const provider = await getProvider(id, user.id);
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  return NextResponse.json({ provider }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as ProviderInput;
  try {
    const provider = await updateProvider(id, user.id, body);
    if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    return NextResponse.json({ provider }, { status: 200 });
  } catch (error) {
    if (error instanceof VodError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const removed = await deleteProvider(id, user.id);
  if (!removed) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  return NextResponse.json({ success: true }, { status: 200 });
}
