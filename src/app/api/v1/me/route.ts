/**
 * GET /api/v1/me — token-auth identity check for connected clients (TronBrowser).
 *
 * Bearer-token authenticated (`Authorization: Bearer btr_...`). CORS is open
 * because these endpoints use bearer tokens, not cookies (no credentials).
 */

import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/api-tokens';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  }
  return NextResponse.json({ connected: true, id: user.id, email: user.email }, { headers: CORS });
}
