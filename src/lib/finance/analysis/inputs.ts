/**
 * Finance — gather model inputs from market data (PRD §3.3 pipeline step 1).
 */

import type { Candle, Quote } from '@/lib/finance/market-data';
import type { ReportInputs, ReportSource } from './types';

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Build a short human-readable price-action summary for the prompt. */
export function buildPriceSummary(quote: Quote | null, candles: Candle[]): string | undefined {
  const parts: string[] = [];

  if (quote) {
    const dir = quote.change >= 0 ? '+' : '';
    parts.push(
      `Last price $${fmt(quote.price)} (${dir}${fmt(quote.changePercent)}% vs previous close $${fmt(quote.previousClose)}).`,
    );
  }

  if (candles.length > 0) {
    const closes = candles.map((c) => c.close);
    const low = Math.min(...candles.map((c) => c.low));
    const high = Math.max(...candles.map((c) => c.high));
    const first = closes[0];
    const last = closes[closes.length - 1];
    const periodPct = first > 0 ? ((last - first) / first) * 100 : 0;
    parts.push(
      `Over the last ${candles.length} trading days the range was $${fmt(low)}–$${fmt(high)}, ` +
        `a ${periodPct >= 0 ? '+' : ''}${fmt(periodPct)}% move.`,
    );
  }

  return parts.length ? parts.join(' ') : undefined;
}

export interface BuildInputsArgs {
  symbol: string;
  quote: Quote | null;
  candles: Candle[];
  headlines?: ReportSource[];
}

export function buildReportInputs({ symbol, quote, candles, headlines }: BuildInputsArgs): ReportInputs {
  return {
    symbol,
    priceSummary: buildPriceSummary(quote, candles),
    headlines,
  };
}
