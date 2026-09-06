/** @route GET /.well-known/openswarm-hub.json — the hub record, where clients look first. */
import { NextRequest } from 'next/server';
import { hubRecord } from '@/lib/openswarm/service';
import { json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return json(hubRecord(new URL(request.url).origin));
}
