/**
 * Finance — watchlist helpers.
 */

import { normalizeSymbol } from './market-data/stooq';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** Max length for a watchlist name. */
export const MAX_WATCHLIST_NAME = 60;

/** Default name used for the first/auto-created list. */
export const DEFAULT_WATCHLIST_NAME = 'Watchlist';

/**
 * Trim + length-bound a user-supplied watchlist name. Returns null when the
 * input is empty after trimming (the caller rejects it).
 */
export function sanitizeWatchlistName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_WATCHLIST_NAME);
  return name.length > 0 ? name : null;
}

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
