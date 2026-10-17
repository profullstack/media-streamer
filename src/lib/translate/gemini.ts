import { SpeechError, type TextTranslator } from '@profullstack/live-translate';

const MODEL = 'gemini-flash-latest';

/**
 * Text step of live translation: one Gemini call per batch of phrases, same
 * order and length back. Thinking is off, since each phrase must be translated
 * a few seconds behind the speaker.
 */
export class GeminiTranslator implements TextTranslator {
  constructor(
    private readonly key = process.env.GEMINI_API_KEY ?? '',
    private readonly fetcher: typeof fetch = fetch
  ) {}

  available(): boolean {
    return this.key !== '';
  }

  async translate(
    texts: string[],
    from: string,
    to: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<{ texts: string[] }> {
    if (!this.available()) throw new SpeechError('translation needs GEMINI_API_KEY on the server', 503);
    const response = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key },
        signal: options.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: `Translate each phrase of live speech from language "${from}" to language "${to}". ` +
                'Phrases may be sentence fragments; translate them as spoken, keep technical terms accurate, ' +
                'and return a JSON array with exactly one translated string per input phrase, in order.',
            }],
          },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(texts) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    if (!response.ok) {
      console.error('[translate] Gemini failed', response.status, (await response.text()).slice(0, 300));
      throw new SpeechError('translation is unavailable right now', response.status === 429 ? 429 : 502);
    }
    const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    let out: unknown;
    try {
      out = JSON.parse(raw);
    } catch {
      throw new SpeechError('translation returned no phrases', 502);
    }
    if (!Array.isArray(out) || out.length !== texts.length || out.some((text) => typeof text !== 'string')) {
      throw new SpeechError('translation omitted a phrase', 502);
    }
    return { texts: out as string[] };
  }
}
