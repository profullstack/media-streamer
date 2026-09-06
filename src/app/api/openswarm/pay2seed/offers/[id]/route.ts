/** @route GET /api/openswarm/pay2seed/offers/[id] — an offer, its attestation and its leases. */
import { NextRequest } from 'next/server';
import { getAttestation, getOffer } from '@/lib/openswarm/service';
import { failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const offer = await getOffer(decodeURIComponent(id));
    if (!offer) return json({ error: 'no such offer' }, 404);
    const attestation = await getAttestation(offer.attestationId);
    return json({
      offer,
      attestation: attestation
        ? {
            id: attestation.id,
            basis: attestation.basis,
            visibility: attestation.visibility,
            license: attestation.license,
            description: attestation.description,
            subject: attestation.subject,
            status: attestation.status,
            readme: attestation.readme,
          }
        : null,
    });
  } catch (error) {
    return failed(error);
  }
}
