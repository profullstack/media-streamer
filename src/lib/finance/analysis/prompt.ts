/**
 * Finance — versioned AI report prompt (PRD §3.3, §7).
 *
 * Bump PROMPT_VERSION whenever the template or output contract changes so the
 * `(symbol, model, prompt_version)` cache key invalidates stale reports.
 */

import type { ReportInputs } from './types';

export const PROMPT_VERSION = 1;

/**
 * Hard token budget per report (cost control, PRD §3.3).
 *
 * NB: gpt-5.x reasoning models spend *hidden reasoning tokens* out of this same
 * `max_completion_tokens` budget before emitting any output. The JSON report
 * itself runs ~1500-1900 tokens, so a 2000 cap left almost no headroom — when
 * reasoning ran long the output got truncated, JSON.parse failed, and the route
 * surfaced a misleading "empty or unusable report". 4000 gives reasoning room
 * without changing per-run cost (you only pay for tokens actually produced).
 */
export const MAX_COMPLETION_TOKENS = 4000;

export const SYSTEM_PROMPT = `You are a financial research analyst writing an informational, long-form narrative thesis about a publicly traded company or ETF, in the spirit of a community "narrative" — covering what the business does, recent catalysts, a bull case, a bear case, valuation framing, and key risks.

STRICT RULES:
- This is NOT financial advice. Do not tell the reader to buy, sell, or hold. Do not give price targets or position sizing.
- Be balanced: a genuine bull case AND a genuine bear case.
- Be concrete and specific; avoid generic filler. If you are uncertain or lack recent data, say so plainly rather than inventing facts.
- Only cite sources you are confident exist; never fabricate URLs.

Respond with STRICT JSON only (no markdown, no prose outside JSON) matching exactly this shape:
{
  "summary": string,            // 2-4 sentence business summary
  "catalysts": string[],        // recent developments / catalysts, each a short paragraph
  "bullCase": string,           // the constructive case
  "bearCase": string,           // the skeptical case
  "valuation": string,          // valuation framing, no advice
  "risks": string[],            // key risks, each a short bullet
  "sources": [{ "title": string, "url": string }]  // may be empty
}`;

export function buildUserPrompt(inputs: ReportInputs): string {
  const lines: string[] = [`Write the research narrative for ticker: ${inputs.symbol}.`];

  if (inputs.priceSummary) {
    lines.push('', 'Recent price action:', inputs.priceSummary);
  }

  if (inputs.headlines && inputs.headlines.length > 0) {
    lines.push('', 'Recent headlines (for context; verify before relying on them):');
    for (const h of inputs.headlines.slice(0, 12)) {
      lines.push(`- ${h.title}${h.url ? ` (${h.url})` : ''}`);
    }
  }

  lines.push(
    '',
    'Return the JSON object described in the system prompt. Keep the total under ~900 words.',
  );

  return lines.join('\n');
}
