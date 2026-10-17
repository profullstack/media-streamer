import { describe, expect, it, vi } from 'vitest';
import { SpeechError } from '@profullstack/live-translate';

import { GeminiTranslator } from './gemini';

const reply = (text: string, status = 200): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status })) as unknown as typeof fetch;

describe('GeminiTranslator', () => {
  it('returns one translation per phrase, in order', async () => {
    const fetcher = reply('["hola", "mundo"]');
    const out = await new GeminiTranslator('k', fetcher).translate(['hello', 'world'], 'en', 'es');
    expect(out.texts).toEqual(['hola', 'mundo']);
    const [, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'k' });
    expect(JSON.parse((init as RequestInit).body as string).contents[0].parts[0].text).toBe('["hello","world"]');
  });

  it('rejects a reply that drops a phrase', async () => {
    await expect(new GeminiTranslator('k', reply('["hola"]')).translate(['hello', 'world'], 'en', 'es')).rejects.toThrow('omitted');
  });

  it('maps provider rate limits to 429', async () => {
    const error = await new GeminiTranslator('k', reply('', 429)).translate(['hi'], 'en', 'es').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechError);
    expect((error as SpeechError).status).toBe(429);
  });

  it('is unavailable without a key', async () => {
    const translator = new GeminiTranslator('', reply('[]'));
    expect(translator.available()).toBe(false);
    await expect(translator.translate(['hi'], 'en', 'es')).rejects.toMatchObject({ status: 503 });
  });
});
