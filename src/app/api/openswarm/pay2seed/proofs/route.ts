/**
 * @route POST /api/openswarm/pay2seed/proofs — report a period's verdict.
 *
 * A passed period is paid at once; the receipt's unique (lease, period) is the
 * whole of the idempotency, so a verifier that reports twice pays once. Two
 * consecutive failures end the lease and reopen the slot.
 *
 * Only the hub's own verifier may report today. A seeder cannot mark its own
 * period proven, which is the point of a proof.
 */
import { NextRequest } from 'next/server';
import { reportProof } from '@/lib/openswarm/service';
import { body, failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

function authorised(request: NextRequest): boolean {
  const expected = process.env.OPENSWARM_VERIFIER_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!authorised(request)) return json({ error: 'a verifier token is required to report a proof' }, 401);
    const input = await body<{
      lease?: string;
      period?: number;
      kind?: 'challenge' | 'probe';
      passed?: boolean;
      verifier?: string | null;
      detail?: string | null;
      record?: unknown;
    }>(request);
    if (!input.lease || typeof input.period !== 'number' || typeof input.passed !== 'boolean') {
      return json({ error: 'lease, period and passed are required' }, 400);
    }
    const result = await reportProof({
      leaseId: input.lease,
      period: input.period,
      kind: input.kind ?? 'probe',
      passed: input.passed,
      verifierKey: input.verifier ?? null,
      detail: input.detail ?? null,
      record: input.record,
    });
    return json({
      lease: result.lease,
      earnedUsd: result.earnedUsd,
      alreadyRecorded: result.alreadyRecorded,
    });
  } catch (error) {
    return failed(error);
  }
}
