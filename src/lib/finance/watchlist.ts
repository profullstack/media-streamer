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
 * First line of the pre-CSV all-lists export (`#watchlists`, one
 * `Name,TICKER,…` line per list). Still parsed on import so files exported
 * before the spreadsheet format shipped keep working.
 */
export const WATCHLISTS_EXPORT_HEADER = '#watchlists';

/** File name for the all-lists export. */
export const WATCHLISTS_EXPORT_FILENAME = 'watchlists.csv';

export interface NamedWatchlist {
  name: string;
  symbols: string[];
}

/**
 * Parse the legacy `#watchlists` export. Returns null when the sentinel is
 * absent, i.e. this is not that format and the caller should try another.
 */
export function parseWatchlistsExport(text: string): NamedWatchlist[] | null {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first === -1 || lines[first].trim().toLowerCase() !== WATCHLISTS_EXPORT_HEADER) return null;

  const out: NamedWatchlist[] = [];
  for (const line of lines.slice(first + 1)) {
    if (!line.trim()) continue;
    const [rawName, ...rest] = parseCsvLine(line.trim());
    const name = sanitizeWatchlistName(rawName);
    if (!name) continue;
    out.push({ name, symbols: parseSymbolList(rest).valid });
  }
  return out;
}

// --- Spreadsheet CSV export ------------------------------------------------

/**
 * Column order of the export. Ticker first (leftmost), then which list it is
 * on, then the market data the watchlist cards show. Price columns are blank
 * when the provider has no data for that symbol.
 */
export const WATCHLIST_CSV_COLUMNS = [
  'Symbol',
  'List',
  'Price',
  'Change',
  'Change %',
  '1D %',
  '5D %',
  '30D %',
  'Open',
  'High',
  'Low',
  'Prev Close',
  'Volume',
  'As Of',
] as const;

/** Market data for one exported row; every field is optional. */
export interface WatchlistCsvQuote {
  price?: number;
  change?: number;
  changePercent?: number;
  previousClose?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  /** UTC unix seconds of the latest bar. */
  asOf?: number;
}

/** Trailing % changes for one exported row. */
export interface WatchlistCsvChanges {
  d1?: number | null;
  d5?: number | null;
  d30?: number | null;
}

export interface WatchlistCsvData {
  quotes?: Record<string, WatchlistCsvQuote | undefined>;
  changes?: Record<string, WatchlistCsvChanges | undefined>;
}

/** Escape one CSV field (RFC4180: quote when it holds a comma, quote or newline). */
function csvField(value: string): string {
  return /["\n\r,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Split one CSV line into fields, honoring quoted fields and `""` escapes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** Fixed-decimal cell, blank when the value is missing or non-finite. */
function num(value: number | null | undefined, decimals = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '';
}

/** Unix seconds -> `YYYY-MM-DD`, blank when absent. */
function asOfDate(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
  const iso = new Date(seconds * 1000).toISOString();
  return iso.slice(0, 10);
}

/**
 * Render lists as a spreadsheet-friendly CSV: a header row, then one row per
 * ticker with the symbol leftmost and its live market data alongside. Lists
 * are grouped by name and tickers within each are alphabetical. An empty list
 * still gets a row (blank symbol) so it survives a round trip.
 */
export function formatWatchlistsCsv(lists: NamedWatchlist[], data: WatchlistCsvData = {}): string {
  const rows: string[] = [WATCHLIST_CSV_COLUMNS.join(',')];

  for (const list of [...lists].sort((a, b) => a.name.localeCompare(b.name))) {
    const symbols = formatSymbolsCsv(list.symbols);
    if (!symbols) {
      rows.push(`,${csvField(list.name)}`);
      continue;
    }
    for (const symbol of symbols.split(',')) {
      const q = data.quotes?.[symbol];
      const c = data.changes?.[symbol];
      rows.push(
        [
          symbol,
          csvField(list.name),
          num(q?.price),
          num(q?.change),
          num(q?.changePercent),
          num(c?.d1),
          num(c?.d5),
          num(c?.d30),
          num(q?.open),
          num(q?.high),
          num(q?.low),
          num(q?.previousClose),
          num(q?.volume, 0),
          asOfDate(q?.asOf),
        ].join(','),
      );
    }
  }

  return rows.join('\n');
}

/**
 * Parse the spreadsheet CSV back into lists, keyed off the `Symbol` / `List`
 * header columns — price columns are ignored, so a file edited in a
 * spreadsheet still imports. Returns null when the header isn't ours, leaving
 * the caller to fall back to a plain ticker list.
 *
 * `fallbackName` names rows whose `List` cell is blank (or when the file has
 * no `List` column at all) — callers pass the file name.
 */
export function parseWatchlistsCsv(text: string, fallbackName: string): NamedWatchlist[] | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const symbolAt = header.indexOf('symbol');
  if (symbolAt === -1) return null;
  const listAt = header.indexOf('list');

  const order: string[] = [];
  const bySymbolList = new Map<string, { name: string; symbols: string[] }>();

  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const name = sanitizeWatchlistName(listAt === -1 ? fallbackName : fields[listAt]) ?? fallbackName;
    const key = name.toLowerCase();
    let entry = bySymbolList.get(key);
    if (!entry) {
      entry = { name, symbols: [] };
      bySymbolList.set(key, entry);
      order.push(key);
    }
    const symbol = parseSymbolList(fields[symbolAt] ?? '').valid[0];
    if (symbol && !entry.symbols.includes(symbol)) entry.symbols.push(symbol);
  }

  return order.map((key) => bySymbolList.get(key) as NamedWatchlist);
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
