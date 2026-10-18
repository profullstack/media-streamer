/**
 * Live translated audio for VOD playback (@profullstack/live-translate):
 * the viewer's browser sends the playing title's audio, ElevenLabs Scribe
 * hears it, Gemini translates it and ElevenLabs Flash re-voices it.
 *
 * Sold as nixamp sells it (./passes.ts): free daily sessions, then prepaid
 * passes. The provider budgets below are a second brake on top, small because
 * the ElevenLabs plan is Starter, and tunable from app.env without a deploy.
 */
import { LiveVoice, SpeechError } from '@profullstack/live-translate';

import { GeminiTranslator } from './gemini';
import { getPasses, translationAvailable } from './passes';

export { GeminiTranslator } from './gemini';
export { getPasses, passesReturningTo, isTranslationPayment, RETURN_PATH } from './passes';
export { SpeechError };

const num = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

let voice: LiveVoice | null = null;
let translator: GeminiTranslator | null = null;

export function getLiveVoice(): LiveVoice {
  voice ??= new LiveVoice({
    tokenPrefix: 'btv_',
    billing: translationAvailable() ? getPasses() : undefined,
    // Flash characters (spoken translation) and Scribe seconds (hearing) per day.
    dailyChars: num('LIVE_TRANSLATE_DAILY_CHARS', 20_000),
    userDailyChars: num('LIVE_TRANSLATE_USER_DAILY_CHARS', 6_000),
    dailyAudioSeconds: num('LIVE_TRANSLATE_DAILY_AUDIO_SECONDS', 7_200),
    userDailyAudioSeconds: num('LIVE_TRANSLATE_USER_DAILY_AUDIO_SECONDS', 2_400),
  });
  return voice;
}

export function getTranslator(): GeminiTranslator {
  translator ??= new GeminiTranslator();
  return translator;
}

/** The playback session a request belongs to: the free-session and billing key. */
export function sessionOf(request: Request): string {
  const value = request.headers.get('x-translation-session') ?? '';
  return /^[\w-]{1,80}$/.test(value) ? value : '';
}

/** JSON error body with the status a SpeechError carries. */
export function speechErrorResponse(error: unknown): Response {
  if (error instanceof SpeechError) return Response.json({ error: error.message }, { status: error.status });
  console.error('[translate]', error);
  return Response.json({ error: 'translated audio is unavailable' }, { status: 502 });
}
