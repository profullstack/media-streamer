/**
 * Finance — Finviz fundamentals/snapshot adapter.
 *
 * Finviz has no public API, but its classic quote page exposes the full
 * snapshot table (valuation, performance, technicals, fund details, dividend)
 * plus a company/fund description. We fetch the HTML and parse it into ordered
 * label/value `FundamentalMetric`s so the ticker page can render the same data
 * shown at https://finviz.com/quote.ashx?t=<SYM>.
 *
 * Parsing targets the stable markup:
 *   table.snapshot-table2 > td > div.snapshot-td-label   (labels)
 *                          > td > div.snapshot-td-content (values, with an
 *                            optional span.is-positive / .is-negative)
 * and div.quote_profile-bio for the description. Network/markup failures
 * return null so the feature degrades gracefully (PRD §6).
 */

import { parseHTML } from 'linkedom';
import { normalizeSymbol } from './stooq';
import type { FundamentalMetric, Fundamentals } from './types';

type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const FINVIZ_QUOTE_URL = 'https://finviz.com/quote.ashx';

// Finviz blocks requests carrying the default Node/undici UA, so present a
// browser-like UA (and accept header) on every request.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Collapse runs of whitespace and trim — Finviz values carry stray newlines. */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parse the Finviz quote-page HTML into ordered fundamentals. Exported so the
 * parser can be unit-tested against a fixture without a network call.
 */
export function parseFinvizSnapshot(html: string, symbol: string): Fundamentals | null {
  const { document } = parseHTML(html);

  const table = document.querySelector('table.snapshot-table2');
  if (!table) return null;

  const labelEls = Array.from(table.querySelectorAll('.snapshot-td-label'));
  const valueEls = Array.from(table.querySelectorAll('.snapshot-td-content'));

  const metrics: FundamentalMetric[] = [];
  const count = Math.min(labelEls.length, valueEls.length);
  for (let i = 0; i < count; i++) {
    const label = clean(labelEls[i].textContent ?? '');
    const valueEl = valueEls[i];
    const value = clean(valueEl.textContent ?? '');
    if (!label || !value || value === '-') continue;

    const tone = valueEl.querySelector('.is-positive')
      ? 'positive'
      : valueEl.querySelector('.is-negative')
        ? 'negative'
        : null;

    metrics.push({ label, value, tone });
  }

  if (metrics.length === 0) return null;

  const bio = document.querySelector('.quote_profile-bio');
  const description = bio ? clean(bio.textContent ?? '') || null : null;

  return {
    symbol: normalizeSymbol(symbol),
    source: 'finviz',
    metrics,
    description,
    asOf: Math.floor(Date.now() / 1000),
  };
}

interface FinvizOptions {
  /** Injectable for tests. Defaults to global fetch. */
  fetchFn?: FetchFn;
}

/**
 * Fetch + parse the Finviz fundamentals snapshot for `symbol`. Returns null on
 * any network or parse failure (callers render defensively).
 */
export async function getFinvizFundamentals(
  symbol: string,
  options: FinvizOptions = {},
): Promise<Fundamentals | null> {
  const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init) as ReturnType<FetchFn>);
  const canonical = normalizeSymbol(symbol);
  const url = `${FINVIZ_QUOTE_URL}?t=${encodeURIComponent(canonical)}&p=d`;

  const res = await fetchFn(url, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`Finviz request failed: ${res.status}`);
  }
  return parseFinvizSnapshot(await res.text(), canonical);
}
