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

/**
 * First line of an all-lists export. Import keys off this sentinel to tell a
 * multi-list file from a plain ticker list — without it, a multi-line ticker
 * file would be ambiguous (is the first field a list name or a symbol?).
 */
export const WATCHLISTS_EXPORT_HEADER = '#watchlists';

/** File name for the all-lists export. */
export const WATCHLISTS_EXPORT_FILENAME = 'watchlists.csv';

export interface NamedWatchlist {
  name: string;
  symbols: string[];
}

/** Quote a list name if it would otherwise collide with the field separator. */
function quoteName(name: string): string {
  return /["\n,]/.test(name) ? `"${name.replace(/"/g, '""')}"` : name;
}

/** Split a line into its (possibly quoted) leading name and the rest. */
function splitNameAndRest(line: string): [string, string] {
  if (!line.startsWith('"')) {
    const comma = line.indexOf(',');
    return comma === -1 ? [line, ''] : [line.slice(0, comma), line.slice(comma + 1)];
  }
  let name = '';
  let i = 1;
  while (i < line.length) {
    if (line[i] === '"') {
      if (line[i + 1] === '"') {
        name += '"';
        i += 2;
        continue;
      }
      i += 1;
      break;
    }
    name += line[i];
    i += 1;
  }
  // `i` now sits just past the closing quote; the rest follows its comma.
  return [name, line[i] === ',' ? line.slice(i + 1) : ''];
}

/**
 * Render every list as one file: a sentinel line, then one line per list —
 * `Name,TICKER,TICKER,…` with tickers alphabetical and the lists themselves
 * sorted by name. Empty lists are kept so the file round-trips exactly.
 */
export function formatWatchlistsExport(lists: NamedWatchlist[]): string {
  const lines = [...lists]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((list) => {
      const csv = formatSymbolsCsv(list.symbols);
      return csv ? `${quoteName(list.name)},${csv}` : quoteName(list.name);
    });
  return [WATCHLISTS_EXPORT_HEADER, ...lines].join('\n');
}

/**
 * Parse an all-lists export. Returns null when the sentinel is absent, i.e.
 * the file is a plain ticker list and the caller should treat it as one list.
 */
export function parseWatchlistsExport(text: string): NamedWatchlist[] | null {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first === -1 || lines[first].trim().toLowerCase() !== WATCHLISTS_EXPORT_HEADER) return null;

  const out: NamedWatchlist[] = [];
  for (const line of lines.slice(first + 1)) {
    if (!line.trim()) continue;
    const [rawName, rest] = splitNameAndRest(line.trim());
    const name = sanitizeWatchlistName(rawName);
    if (!name) continue;
    out.push({ name, symbols: parseSymbolList(rest).valid });
  }
  return out;
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
