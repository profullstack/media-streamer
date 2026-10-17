import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getLiveVoice, speechErrorResponse } from '@/lib/translate';

// Live translated audio: a 90-second voice grant for one playback session,
// so each spoken line is authorized without re-checking the session cookie.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'sign in to use translated audio' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { channel?: unknown };
  try {
    return Response.json(await getLiveVoice().grant(user.id, typeof body.channel === 'string' ? body.channel : ''));
  } catch (error) {
    return speechErrorResponse(error);
  }
}
