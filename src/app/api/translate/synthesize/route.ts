import { NextRequest } from 'next/server';
import type { VoiceRequest } from '@profullstack/live-translate';

import { getLiveVoice, speechErrorResponse } from '@/lib/translate';

// Live translated audio: one translated line in, 16 kHz PCM out (ElevenLabs
// Flash), authorized by the grant from /api/translate/grant in x-voice-grant
// (not Authorization: the proxy gate reads any Bearer as a Supabase session).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  let body: VoiceRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'send a caption as JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return Response.json({ error: 'send a caption as JSON' }, { status: 400 });
  const token = request.headers.get('x-voice-grant') ?? '';
  try {
    const voice = getLiveVoice();
    const by = await voice.authorize(token, body.channel ?? '', typeof body.text === 'string' ? body.text.length : 0);
    return await voice.stream(body, by, request.signal);
  } catch (error) {
    return speechErrorResponse(error);
  }
}
