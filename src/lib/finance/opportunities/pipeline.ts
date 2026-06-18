/**
 * Finance — Opportunities generation pipeline.
 *
 * Mirrors the report pipeline: build the versioned prompt → call the LLM (reused
 * ReportLLM interface) → parse to a typed list → render markdown → compute cost.
 * The LLM is injectable so this is unit-testable without the network.
 */

import { estimateCostUsd } from '../analysis/cost';
import { ReportGenerationError, type ReportLLM } from '../analysis/pipeline';
import {
  MAX_COMPLETION_TOKENS,
  OPPORTUNITIES_PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from './prompt';
import { isOpportunitiesUsable, opportunitiesToMarkdown, parseOpportunitiesJson } from './parser';
import type { OpportunityList } from './types';

export interface GenerateOpportunitiesOptions {
  prompt: string;
  llm: ReportLLM;
  model: string;
  now?: Date;
}

/** Generate a structured opportunity list. Throws if the LLM output is unusable. */
export async function generateOpportunities({
  prompt,
  llm,
  model,
  now = new Date(),
}: GenerateOpportunitiesOptions): Promise<OpportunityList> {
  const completion = await llm.complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(prompt),
    model,
    maxTokens: MAX_COMPLETION_TOKENS,
  });

  const parsed = parseOpportunitiesJson(completion.content);
  if (!isOpportunitiesUsable(parsed)) {
    if (completion.finishReason === 'length') {
      throw new ReportGenerationError(
        `Opportunities truncated at the token budget (${MAX_COMPLETION_TOKENS})`,
      );
    }
    throw new ReportGenerationError('Model returned no usable stock ideas');
  }

  const markdown = opportunitiesToMarkdown(prompt, parsed);

  return {
    prompt,
    intro: parsed.intro,
    stocks: parsed.stocks,
    disclaimer: parsed.disclaimer,
    markdown,
    model,
    promptVersion: OPPORTUNITIES_PROMPT_VERSION,
    usage: {
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
      costUsd: estimateCostUsd(completion.promptTokens, completion.completionTokens),
    },
    generatedAt: now.toISOString(),
  };
}
