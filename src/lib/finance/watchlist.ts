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

/**
 * Render symbols as the export format: comma-separated, alphabetical, deduped.
 */
export function formatSymbolsCsv(symbols: string[]): string {
  const seen = new Set<string>();
  for (const raw of symbols) {
    const symbol = normalizeSymbol(raw);
    if (symbol) seen.add(symbol);
  }
  return [...seen].sort().join(',');
}

/** File name for an exported list, e.g. "My Tech List" -> "my-tech-list.csv". */
export function watchlistExportFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_WATCHLIST_NAME);
  return `${slug || 'watchlist'}.csv`;
}

/**
 * Derive a list name from an imported file name — the inverse of
 * {@link watchlistExportFilename}, so an exported list round-trips back to a
 * recognizable name. Separators become spaces; an all-lowercase result (what
 * our own export produces) is title-cased, while a name the user capitalized
 * themselves is left alone.
 */
export function watchlistNameFromFilename(filename: string): string {
  const base = filename
    .replace(/\.[^./\\]*$/, '') // drop the extension
    .replace(/^.*[/\\]/, '') // drop any directory prefix
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!base) return DEFAULT_WATCHLIST_NAME;
  const named = base === base.toLowerCase() ? base.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : base;
  return named.slice(0, MAX_WATCHLIST_NAME);
}

/**
 * Suffix a name until it no longer collides with `existing`, so importing the
 * same file twice yields "Tech 2" rather than a second identical tab.
 */
export function uniqueWatchlistName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${name.slice(0, MAX_WATCHLIST_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return name;
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
