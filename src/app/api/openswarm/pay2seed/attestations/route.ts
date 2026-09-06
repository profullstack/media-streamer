/**
 * @route POST /api/openswarm/pay2seed/attestations — register consent.
 *
 * Nothing is listed on this hub without one. The record is signed by the key
 * that claims it, carries a README, and says on what basis it may be shared.
 * A public claim is visible for a window first, so a notice can void it before
 * anyone is paid to seed something the requester had no right to.
 */
import { NextRequest } from 'next/server';
import { registerAttestation } from '@/lib/openswarm/service';
import { body, failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const record = await body<unknown>(request);
    const { attestation, id } = await registerAttestation(record);
    return json({ id, attestation }, 201);
  } catch (error) {
    return failed(error);
  }
}
