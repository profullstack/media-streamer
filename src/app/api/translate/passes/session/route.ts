import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getPasses, speechErrorResponse } from '@/lib/translate';

// Start translating a playback session: claims one of today's free sessions,
// or checks for audio credit (402 when there is neither).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'Sign in to use translated audio.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { resource?: unknown };
  if (typeof body.resource !== 'string') return Response.json({ error: 'Choose a playback session.' }, { status: 400 });
  try {
    const passes = getPasses();
    await passes.begin(user.id, body.resource);
    return Response.json(await passes.access(user.id));
  } catch (error) {
    return speechErrorResponse(error);
  }
}
