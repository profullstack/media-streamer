/** Turning a hub decision into an HTTP answer, the same way on every route. */
import { NextResponse } from 'next/server';
import { HubError } from './service';
import { OpenSwarmRecordError } from './records';

export const json = (body: unknown, status = 200): NextResponse =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * A refusal is information, not a stack trace: the caller is a program signing
 * records, and the message is what tells it which rule it broke.
 */
export function failed(error: unknown): NextResponse {
  if (error instanceof HubError) return json({ error: error.message }, error.status);
  if (error instanceof OpenSwarmRecordError) return json({ error: error.message }, error.status);
  console.error('[openswarm]', error);
  return json({ error: 'the hub could not complete that' }, 500);
}

export async function body<T>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}
