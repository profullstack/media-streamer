/**
 * @route GET /api/openswarm/hub — the hub record.
 *
 * Also served at /.well-known/openswarm-hub.json, which is where the spec says
 * a client looks. It says who this hub is, what it charges, which consent
 * bases it will list, and that it carries all four lanes.
 */
import { NextRequest } from 'next/server';
import { hubRecord } from '@/lib/openswarm/service';
import { json } from '@/lib/openswarm/route-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return json(hubRecord(new URL(request.url).origin));
}
