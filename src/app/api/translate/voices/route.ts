import { LIVE_VOICE_LANGUAGES, LIVE_VOICE_MODEL } from '@profullstack/live-translate';

import { getCurrentUser } from '@/lib/auth';
import { getLiveVoice, getTranslator, speechErrorResponse } from '@/lib/translate';

// Live translated audio (see src/lib/translate): the voices and languages on offer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'sign in to use translated audio' }, { status: 401 });
  const voice = getLiveVoice();
  if (!voice.available() || !getTranslator().available()) {
    return Response.json({ available: false, voices: [], languages: [] });
  }
  try {
    return Response.json({ available: true, voices: await voice.voices(), model: LIVE_VOICE_MODEL, languages: [...LIVE_VOICE_LANGUAGES] });
  } catch (error) {
    return speechErrorResponse(error);
  }
}
