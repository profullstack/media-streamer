/**
 * @route POST /api/openswarm/pay2seed/parties — register a key.
 *
 * A party says what it is: a human, or a bit (an autonomous agent). An agent
 * that wants to sell in public names the operator answerable for it. A payout
 * address is what makes a key a payee, and without one it cannot take a lease,
 * because there would be nowhere to pay.
 */
import { NextRequest } from 'next/server';
import { registerParty } from '@/lib/openswarm/service';
import { body, failed, json } from '@/lib/openswarm/route-helpers';
import type { PartyKind } from '@/lib/openswarm/lanes';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const input = await body<{
      key?: string;
      kind?: PartyKind;
      operatorKey?: string | null;
      label?: string | null;
      payoutAddress?: string | null;
      payoutNetwork?: string | null;
    }>(request);
    if (!input.key) return json({ error: 'key is required' }, 400);
    const party = await registerParty({ ...input, key: input.key });
    return json({ party }, 201);
  } catch (error) {
    return failed(error);
  }
}
