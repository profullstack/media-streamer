/**
 * Finance — report generation pipeline (PRD §3.3).
 *
 * Pure-ish orchestration: build the versioned prompt → call the LLM → parse to
 * typed sections → render markdown → compute cost. The LLM is behind a narrow
 * injectable interface so this is unit-testable without the network.
 */

import OpenAI from 'openai';
import { estimateCostUsd } from './cost';
import { isReportUsable, parseReportJson, sectionsToMarkdown } from './parser';
import { MAX_COMPLETION_TOKENS, PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import type { FinanceReport, ReportInputs } from './types';

export interface LLMCompletion {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ReportLLM {
  complete(opts: { system: string; user: string; model: string; maxTokens: number }): Promise<LLMCompletion>;
}

export function getReportModel(): string {
  return process.env.FINANCE_OPENAI_MODEL ?? 'gpt-5.5';
}

export function getFreshnessHours(): number {
  const raw = process.env.FINANCE_REPORT_FRESHNESS_HOURS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 24;
}

/** Adapter wrapping the real OpenAI SDK behind the ReportLLM interface. */
export function createOpenAIReportLLM(apiKey: string): ReportLLM {
  const client = new OpenAI({ apiKey });
  return {
    async complete({ system, user, model, maxTokens }) {
      const completion = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: maxTokens,
          temperature: 0.4,
        },
        { timeout: 90_000 },
      );
      return {
        content: completion.choices[0]?.message?.content ?? '',
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      };
    },
  };
}

export class ReportGenerationError extends Error {}

export interface GenerateReportOptions {
  inputs: ReportInputs;
  llm: ReportLLM;
  model?: string;
  now?: Date;
}

/** Generate a structured report for a ticker. Throws if the LLM output is unusable. */
export async function generateReport({
  inputs,
  llm,
  model = getReportModel(),
  now = new Date(),
}: GenerateReportOptions): Promise<FinanceReport> {
  const completion = await llm.complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(inputs),
    model,
    maxTokens: MAX_COMPLETION_TOKENS,
  });

  const { sections, sources: parsedSources } = parseReportJson(completion.content);
  if (!isReportUsable(sections)) {
    throw new ReportGenerationError('Model returned an empty or unusable report');
  }

  // Merge model-cited sources with the headlines we fed in (dedup by title).
  const sources = [...parsedSources];
  for (const headline of inputs.headlines ?? []) {
    if (!sources.some((s) => s.title === headline.title)) sources.push(headline);
  }

  const markdown = sectionsToMarkdown(inputs.symbol, sections, sources);
  const expiresAt = new Date(now.getTime() + getFreshnessHours() * 60 * 60 * 1000);

  return {
    symbol: inputs.symbol,
    model,
    promptVersion: PROMPT_VERSION,
    sections,
    markdown,
    sources,
    usage: {
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
      costUsd: estimateCostUsd(completion.promptTokens, completion.completionTokens),
    },
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
