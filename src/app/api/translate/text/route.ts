import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getPasses, getTranslator, sessionOf, speechErrorResponse } from '@/lib/translate';

// Live translated audio: the heard phrases in, the same phrases translated out.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const code = (value: unknown): string | null => (typeof value === 'string' && /^[a-z]{2,3}$/.test(value) ? value : null);

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'sign in to use translated audio' }, { status: 401 });
  let body: { texts?: unknown; from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad JSON' }, { status: 400 });
  }
  const texts = Array.isArray(body.texts) ? body.texts.filter((text): text is string => typeof text === 'string') : [];
  const from = code(body.from);
  const to = code(body.to);
  if (!texts.length || texts.length > 24 || texts.join('').length > 4000) {
    return Response.json({ error: 'send 1 to 24 phrases' }, { status: 400 });
  }
  if (!from || !to) return Response.json({ error: 'from and to are language codes, such as en and es' }, { status: 400 });
  if (from === to) return Response.json({ texts });
  try {
    // Same access as hearing: a live free session or audio credit.
    await getPasses().require(user.id, sessionOf(request));
    return Response.json(await getTranslator().translate(texts, from, to, { signal: request.signal }));
  } catch (error) {
    return speechErrorResponse(error);
  }
}
