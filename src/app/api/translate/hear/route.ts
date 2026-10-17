import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getLiveVoice, speechErrorResponse } from '@/lib/translate';

// Live translated audio: a short mono 16 kHz WAV of the playing title in,
// speaker turns with word timings out (ElevenLabs Scribe).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 484_000; // 15 s of 16 kHz s16le plus the header

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'sign in to use translated audio' }, { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('audio/wav')) {
    return Response.json({ error: 'send a mono 16 kHz WAV' }, { status: 415 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BYTES) return Response.json({ error: 'send up to 15 seconds of audio' }, { status: 413 });
  const language = request.nextUrl.searchParams.get('language') ?? '';
  try {
    return Response.json(await getLiveVoice().hear(bytes, user.id, request.signal, undefined, '', /^[a-z]{2,3}$/.test(language) ? language : ''));
  } catch (error) {
    return speechErrorResponse(error);
  }
}
