/**
 * Finance — LLM cost accounting (PRD §3.3, §8 spend control).
 *
 * Per-million-token prices are env-overridable so we don't hardcode pricing
 * that drifts. Defaults are conservative placeholders; set the env vars to the
 * real contract price to make the spend dashboard accurate.
 */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** USD per 1M tokens. */
export function inputPricePerMTok(): number {
  return envNumber('FINANCE_PRICE_INPUT_PER_MTOK', 2.5);
}

export function outputPricePerMTok(): number {
  return envNumber('FINANCE_PRICE_OUTPUT_PER_MTOK', 10);
}

/** Estimate USD cost for a generation from token usage. */
export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const input = (Math.max(0, promptTokens) / 1_000_000) * inputPricePerMTok();
  const output = (Math.max(0, completionTokens) / 1_000_000) * outputPricePerMTok();
  // Round to 6 decimals to match the NUMERIC(10,6) column.
  return Math.round((input + output) * 1e6) / 1e6;
}
