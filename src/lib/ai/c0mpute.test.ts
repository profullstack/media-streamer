import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiRouter } from '@profullstack/ai-providers';
import { createReportLLM } from '@/lib/finance/analysis/pipeline';
import { c0mputeEnabled, c0mputeJson } from './c0mpute';

const request = { system: 's', user: 'u', maxTokens: 10, feature: 'test' };
const answering = (text: string) =>
  ({
    generateText: async () => ({ text, model: 'qwen', usage: { inputTokens: 3, outputTokens: 2, estimated: true } }),
  }) as unknown as AiRouter;
const failing = {
  generateText: async () => {
    throw new Error('no live node');
  },
} as unknown as AiRouter;

describe('c0mputeJson', () => {
  afterEach(() => {
    delete process.env.C0MPUTE_DISABLED;
  });

  it('asks for JSON and hands back the answer', async () => {
    let asked: { json?: boolean } = {};
    const ai = {
      generateText: async (req: { json?: boolean }) => {
        asked = req;
        return { text: '{}', model: 'qwen', usage: { inputTokens: 3, outputTokens: 2, estimated: true } };
      },
    } as unknown as AiRouter;
    expect(await c0mputeJson(request, ai)).toEqual({ text: '{}', model: 'qwen', inputTokens: 3, outputTokens: 2 });
    expect(asked.json).toBe(true);
  });

  it('pulls the JSON out of whatever the model wrapped it in', async () => {
    const out = await c0mputeJson(request, answering('Here you go:\n```json\n{"a":1}\n```'));
    expect(out?.text).toBe('{"a":1}');
  });

  it('answers null on a failure or an empty answer, so the caller runs its vendor path', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await c0mputeJson(request, failing)).toBeNull();
    expect(await c0mputeJson(request, answering('no json here'))).toBeNull();
  });

  it('is off with C0MPUTE_DISABLED', async () => {
    process.env.C0MPUTE_DISABLED = '1';
    expect(c0mputeEnabled()).toBe(false);
    expect(await c0mputeJson(request, answering('{}'))).toBeNull();
  });
});

describe('createReportLLM', () => {
  afterEach(() => {
    delete process.env.C0MPUTE_DISABLED;
  });

  it('prices a c0mpute answer at nothing on the spend ledger', async () => {
    const opts = { system: 's', user: 'u', model: 'gpt-5.5', maxTokens: 10 };
    const out = await createReportLLM(undefined, answering('{"a":1}')).complete(opts);
    expect(out).toMatchObject({ content: '{"a":1}', totalTokens: 5, costUsd: 0 });
  });

  it('says so when c0mpute failed and there is no paid key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const opts = { system: 's', user: 'u', model: 'gpt-5.5', maxTokens: 10 };
    await expect(createReportLLM(undefined, failing).complete(opts)).rejects.toThrow('AI service unavailable');
  });
});
