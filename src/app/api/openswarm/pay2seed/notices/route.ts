/**
 * @route POST /api/openswarm/pay2seed/notices — a claim against an attestation.
 *
 * Anyone may file one. The hub records it and forwards it to the requester's
 * notice endpoint; whether the attestation is voided or stands is reviewed,
 * and a hub that voided on nothing at all would not be conformant either way.
 */
import { NextRequest } from 'next/server';
import { fileNotice } from '@/lib/openswarm/service';
import { body, failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const input = await body<{
      attestation?: string;
      kind?: 'rights' | 'illegal' | 'personal-data' | 'other';
      statement?: string;
      claimant?: { name?: string; contact?: string };
      record?: unknown;
    }>(request);
    if (!input.attestation || !input.statement) {
      return json({ error: 'attestation and statement are required' }, 400);
    }
    const result = await fileNotice({
      attestationId: input.attestation,
      kind: input.kind ?? 'other',
      statement: input.statement,
      claimantName: input.claimant?.name ?? null,
      claimantContact: input.claimant?.contact ?? null,
      record: input.record,
    });
    return json(
      {
        notice: result.noticeId,
        attestation: result.attestation.id,
        // Say plainly what happens next rather than implying it is already done.
        outcome: 'received',
        noticeEndpoint: result.attestation.noticeEndpoint,
      },
      201
    );
  } catch (error) {
    return failed(error);
  }
}
