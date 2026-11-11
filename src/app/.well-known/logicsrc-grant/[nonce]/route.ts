/**
 * GET /.well-known/logicsrc-grant/<nonce>: the grant manifest logicsrc fetches
 * over TLS (which keys, the member's vault inbox key, the webhook and its
 * per-request secret). Public by design: the nonce is unguessable and single
 * purpose; unknown or expired nonces are a 404.
 */

import { keyGrants } from '@/lib/logicsrc/grants';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ nonce: string }> }): Promise<Response> {
  const { nonce } = await params;
  return keyGrants().manifestResponse(nonce);
}
