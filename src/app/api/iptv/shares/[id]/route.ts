/**
 * @route PATCH  /api/iptv/shares/[id] — update a listing
 * @route DELETE /api/iptv/shares/[id] — remove a listing
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { IptvResaleError, deleteResale, updateResale, type IptvShareInput } from '@/lib/iptv/shares';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as IptvShareInput;
  try {
    const share = await updateResale(id, user.id, body);
    if (!share) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    return NextResponse.json({ share }, { status: 200 });
  } catch (error) {
    if (error instanceof IptvResaleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
  const removed = await deleteResale(id, user.id);
  if (!removed) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  return NextResponse.json({ success: true }, { status: 200 });
}
