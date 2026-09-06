/** @route GET /api/openswarm/pay2seed/attestations/[id] — the record and where it stands. */
import { NextRequest } from 'next/server';
import { getAttestation } from '@/lib/openswarm/service';
import { failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attestation = await getAttestation(decodeURIComponent(id));
    if (!attestation) return json({ error: 'no such attestation' }, 404);
    return json({ attestation });
  } catch (error) {
    return failed(error);
  }
}
