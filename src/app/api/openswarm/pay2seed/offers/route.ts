/**
 * @route GET  /api/openswarm/pay2seed/offers — the market a seeder picks work from.
 * @route POST /api/openswarm/pay2seed/offers — post an offer against an attestation.
 *
 * The market only shows offers whose attestation is honoured, which is what
 * the claim window is for. Every row carries the basis and the visibility, so a
 * seeder knows before accepting whether it would be holding a stranger's
 * ciphertext or seeding an openly licensed dataset in the clear.
 */
import { NextRequest } from 'next/server';
import { createOffer, listMarket, quoteOffer, type OfferDraft } from '@/lib/openswarm/service';
import { body, failed, json } from '@/lib/openswarm/route-helpers';
import type { Basis, Visibility } from '@/lib/openswarm/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const rows = await listMarket({
      visibility: (url.searchParams.get('visibility') as Visibility) ?? undefined,
      basis: (url.searchParams.get('basis') as Basis) ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 50),
    });
    return json({ offers: rows });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await body<OfferDraft & { requester?: string; quoteOnly?: boolean }>(request);
    if (!input.requester) return json({ error: 'requester is required' }, 400);
    if (!input.attestation) return json({ error: 'attestation is required' }, 400);

    // A quote is free and pure, so a page can show the price without
    // committing anyone to it.
    if (input.quoteOnly) return json({ quote: quoteOffer(input) });

    const { offer, quote } = await createOffer(input, input.requester);
    // Unpaid until the money settles: a budget that is not escrowed is not a
    // promise anybody should seed against.
    return json({ offer, quote, status: 'unpaid' }, 201);
  } catch (error) {
    return failed(error);
  }
}
