/**
 * @route POST /api/openswarm/pay2seed/leases — take a slot on an offer.
 *
 * The seeder proves it holds the key by signing the offer id. It must already
 * be a payee, and clear the hub's standing floor. The lane is stamped here, at
 * the moment the money is agreed, so it survives either party later changing
 * kind.
 */
import { NextRequest } from 'next/server';
import { takeLease } from '@/lib/openswarm/service';
import { body, failed, json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const input = await body<{ offer?: string; seeder?: string; sig?: string }>(request);
    if (!input.offer || !input.seeder || !input.sig) {
      return json({ error: 'offer, seeder and sig are required' }, 400);
    }
    const lease = await takeLease({ offerId: input.offer, seederKey: input.seeder, sig: input.sig });
    return json({ lease }, 201);
  } catch (error) {
    return failed(error);
  }
}
