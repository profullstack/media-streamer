/**
 * POST /api/v1/nixamp/handoffs {host, torrentId, fileIds, name?} — send the
 *   chosen audio files to one of the member's own Nixamp servers, which copies
 *   them and makes a private station draft. A repeat of the same request is
 *   the same handoff.
 * GET  /api/v1/nixamp/handoffs?host=&id= — how it is getting on.
 *
 * Contract: nixamp docs/handoff.md. Rules: src/lib/nixamp/handoff.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getNixampAccount } from '@/lib/nixamp';
import { HandoffError, handoffStatus, startHandoff } from '@/lib/nixamp/handoff';

async function account() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const linked = await getNixampAccount(user.id);
  if (!linked) return { error: NextResponse.json({ error: 'connect nixamp first', code: 'not_connected' }, { status: 409 }) };
  return { user, linked };
}

function failure(error: unknown): NextResponse {
  if (error instanceof HandoffError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: 'could not reach your Nixamp server', code: 'nixamp_unreachable' }, { status: 502 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const who = await account();
  if ('error' in who) return who.error!;
  let body: { host?: unknown; torrentId?: unknown; fileIds?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'the body is not JSON', code: 'bad_json' }, { status: 400 });
  }
  if (typeof body.host !== 'string' || typeof body.torrentId !== 'string' || !Array.isArray(body.fileIds)) {
    return NextResponse.json({ error: 'host, torrentId and fileIds are needed', code: 'invalid_request' }, { status: 400 });
  }
  try {
    const answer = await startHandoff(who.user.id, who.linked, {
      host: body.host,
      torrentId: body.torrentId,
      fileIds: body.fileIds.filter((one): one is string => typeof one === 'string'),
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
    });
    return NextResponse.json(answer.body, { status: answer.status });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const who = await account();
  if ('error' in who) return who.error!;
  const host = request.nextUrl.searchParams.get('host') ?? '';
  const id = request.nextUrl.searchParams.get('id') ?? '';
  try {
    const answer = await handoffStatus(who.linked, host, id);
    return NextResponse.json(answer.body, { status: answer.status });
  } catch (error) {
    return failure(error);
  }
}
