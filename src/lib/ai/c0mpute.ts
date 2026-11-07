/**
 * c0mpute first for text and JSON.
 *
 * Callers keep their own vendor code as the fallback, so the package's paid
 * providers stay out of it and this answers null instead of throwing: every
 * caller then runs exactly the path it ran before, failures included.
 */

import { createAiProviders, extractJson, type AiRouter } from '@profullstack/ai-providers';

export interface C0mputeAnswer {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function c0mputeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !/^(1|true|yes|on)$/i.test(env.C0MPUTE_DISABLED ?? '');
}

let peers: AiRouter | undefined;

export async function c0mputeJson(
  request: { system: string; user: string; maxTokens: number; feature: string },
  ai?: AiRouter,
): Promise<C0mputeAnswer | null> {
  if (!c0mputeEnabled()) return null;
  try {
    const out = await (ai ?? (peers ??= createAiProviders({ paidFallback: false }))).generateText({
      ...request,
      json: true,
    });
    return {
      // Models wrap JSON in fences or prose, and callers JSON.parse this.
      text: JSON.stringify(extractJson(out.text)),
      model: out.model,
      inputTokens: out.usage.inputTokens,
      outputTokens: out.usage.outputTokens,
    };
  } catch (error) {
    console.error(`[ai] c0mpute could not answer ${request.feature}:`, error instanceof Error ? error.message : error);
    return null;
  }
}
