/**
 * Finance — defensive parser + markdown renderer for the Opportunities JSON.
 *
 * The model can return partial/odd shapes; we coerce to a stable typed list and
 * never throw on missing fields (mirrors the report parser).
 */

import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import type { OpportunityStock } from './types';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optional(value: unknown): string | undefined {
  const s = asString(value);
  return s.length > 0 ? s : undefined;
}

/** Coerce one raw item into a typed stock, or null if it has no valid symbol/thesis. */
function asStock(value: unknown): OpportunityStock | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const symbol = normalizeSymbol(asString(rec.symbol));
  const thesis = asString(rec.thesis);
  if (!SYMBOL_RE.test(symbol) || !thesis) return null;
  return {
    symbol,
    name: optional(rec.name),
    thesis,
    catalysts: optional(rec.catalysts),
    risk: optional(rec.risk),
    priceContext: optional(rec.priceContext),
  };
}

export interface ParsedOpportunities {
  intro: string;
  stocks: OpportunityStock[];
  disclaimer: string;
}

const DEFAULT_DISCLAIMER =
  'Not financial advice. Informational/entertainment only — we are not a registered investment adviser. Do your own research.';

/** Parse raw LLM content (expected JSON) into a typed, de-duplicated list. */
export function parseOpportunitiesJson(raw: string): ParsedOpportunities {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
  } catch {
    // Fall back to an empty list; the pipeline decides whether that's usable.
  }

  const rawStocks = Array.isArray(obj.stocks) ? obj.stocks : [];
  const seen = new Set<string>();
  const stocks: OpportunityStock[] = [];
  for (const item of rawStocks) {
    const stock = asStock(item);
    if (stock && !seen.has(stock.symbol)) {
      seen.add(stock.symbol);
      stocks.push(stock);
    }
  }

  return {
    intro: asString(obj.intro),
    stocks,
    disclaimer: asString(obj.disclaimer) || DEFAULT_DISCLAIMER,
  };
}

/** A list is usable if it produced at least one valid stock. */
export function isOpportunitiesUsable(parsed: ParsedOpportunities): boolean {
  return parsed.stocks.length > 0;
}

/** Render the parsed list to copyable markdown. */
export function opportunitiesToMarkdown(
  prompt: string,
  parsed: ParsedOpportunities,
): string {
  const parts: string[] = ['# Stock Opportunities', '', `_Parameters: ${prompt}_`, ''];
  if (parsed.intro) parts.push(parsed.intro, '');

  parsed.stocks.forEach((s, i) => {
    const heading = `## ${i + 1}. ${s.symbol}${s.name ? ` — ${s.name}` : ''}`;
    parts.push(heading, '', s.thesis, '');
    if (s.priceContext) parts.push(`- **Price:** ${s.priceContext}`);
    if (s.catalysts) parts.push(`- **Catalysts:** ${s.catalysts}`);
    if (s.risk) parts.push(`- **Risk:** ${s.risk}`);
    parts.push('');
  });

  parts.push('---', '', `_${parsed.disclaimer}_`);
  return parts.join('\n').trim();
}
