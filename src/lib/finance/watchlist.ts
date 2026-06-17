/**
 * Finance — watchlist helpers.
 */

import { normalizeSymbol } from './market-data/stooq';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export interface ParsedSymbolList {
  /** Valid, normalized, de-duplicated symbols. */
  valid: string[];
  /** Raw tokens that failed validation (for user feedback). */
  invalid: string[];
}

/**
 * Parse a pasted list of tickers (comma / whitespace / newline / semicolon
 * separated, or an array) into validated, normalized, de-duplicated symbols.
 */
export function parseSymbolList(input: string | string[]): ParsedSymbolList {
  const tokens = Array.isArray(input) ? input : input.split(/[\s,;]+/);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const symbol = normalizeSymbol(trimmed);
    if (SYMBOL_RE.test(symbol)) {
      if (!seen.has(symbol)) {
        seen.add(symbol);
        valid.push(symbol);
      }
    } else {
      invalid.push(trimmed);
    }
  }

  return { valid, invalid };
}
