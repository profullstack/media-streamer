'use client';

/**
 * TickerView — the paid `/finance/ticker/:ticker` experience (PRD §3.2).
 *
 * Fetches the quote + candles from the paid-gated finance API, renders the
 * key-stats panel, the range-selectable chart, a watchlist toggle, and the AI
 * report area. AI generation arrives in M2 — the Analyze button is laid out but
 * disabled here, and never auto-runs on load (PRD §3.2, §6).
 */

import { useCallback, useEffect, useState } from 'react';
import { FinanceChart } from './finance-chart';
import { ReportPanel } from './report-panel';
// Import from the SDK-free `types` module (not the index) so the Alpaca SDK is
// never pulled into the client bundle.
import { TICKER_RANGES, type Candle, type Quote, type TickerRange } from '@/lib/finance/market-data/types';

const RECENT_KEY = 'finance:recent';
const RECENT_MAX = 12;

interface Holding {
  symbol: string;
  quantity: number;
  avgCost: number | null;
  marketValue: number | null;
}

function rememberRecent(symbol: string): void {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [symbol, ...list.filter((s) => s !== symbol)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable; recents are best-effort.
  }
}

function formatNumber(value: number | undefined, opts?: Intl.NumberFormatOptions): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, opts);
}

function formatVolume(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

export function TickerView({ symbol }: { symbol: string }): React.ReactElement {
  const [range, setRange] = useState<TickerRange>('1Y');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inWatchlist, setInWatchlist] = useState<boolean | null>(null);
  const [holding, setHolding] = useState<Holding | null>(null);

  useEffect(() => {
    rememberRecent(symbol);
  }, [symbol]);

  // Quote (independent of range).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/finance/quote?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body?.quote) setQuote(body.quote as Quote);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Candles (re-fetched per range).
  useEffect(() => {
    let cancelled = false;
    setLoadingCandles(true);
    setError(null);
    fetch(`/api/finance/candles?symbol=${encodeURIComponent(symbol)}&range=${range}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setCandles(Array.isArray(body.candles) ? (body.candles as Candle[]) : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load chart data.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCandles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  // Watchlist membership.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/finance/watchlist', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { watchlist: [] }))
      .then((body: { watchlist?: Array<{ symbol: string }> }) => {
        if (cancelled) return;
        setInWatchlist((body.watchlist ?? []).some((w) => w.symbol === symbol));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Connected-broker holdings for this symbol (chart overlay + row).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/finance/holdings?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { holdings: [] }))
      .then((body: { holdings?: Holding[] }) => {
        if (cancelled) return;
        setHolding(body.holdings && body.holdings.length > 0 ? body.holdings[0] : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const toggleWatchlist = useCallback(async () => {
    const next = !inWatchlist;
    setInWatchlist(next);
    try {
      if (next) {
        await fetch('/api/finance/watchlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbol }),
        });
      } else {
        await fetch(`/api/finance/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      }
    } catch {
      setInWatchlist(!next); // revert on failure
    }
  }, [inWatchlist, symbol]);

  const changePositive = (quote?.change ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-text-primary">{symbol}</h1>
            <button
              type="button"
              onClick={toggleWatchlist}
              disabled={inWatchlist === null}
              className="btn btn-secondary text-sm disabled:opacity-50"
            >
              {inWatchlist ? '★ In watchlist' : '☆ Add to watchlist'}
            </button>
          </div>
          {quote ? <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-semibold text-text-primary">
                ${formatNumber(quote.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={changePositive ? 'text-green-400' : 'text-red-400'}>
                {changePositive ? '+' : ''}
                {formatNumber(quote.change, { maximumFractionDigits: 2 })} ({changePositive ? '+' : ''}
                {formatNumber(quote.changePercent, { maximumFractionDigits: 2 })}%)
              </span>
            </div> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {TICKER_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                range === r
                  ? 'bg-bg-active text-text-primary'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <FinanceChart candles={candles} loading={loadingCandles} avgCost={holding?.avgCost ?? null} />
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {holding ? <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border-subtle bg-bg-secondary px-4 py-3 text-sm">
          <span className="font-semibold text-text-primary">Your position</span>
          <span className="text-text-secondary">{formatNumber(holding.quantity, { maximumFractionDigits: 4 })} shares</span>
          {holding.avgCost !== null && (
            <span className="text-text-secondary">avg cost ${formatNumber(holding.avgCost, { maximumFractionDigits: 2 })}</span>
          )}
          {holding.marketValue !== null && (
            <span className="text-text-secondary">value ${formatNumber(holding.marketValue, { maximumFractionDigits: 2 })}</span>
          )}
        </div> : null}

      {/* Key stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" value={quote ? `$${formatNumber(quote.open, { maximumFractionDigits: 2 })}` : '—'} />
        <Stat label="Day high" value={quote ? `$${formatNumber(quote.high, { maximumFractionDigits: 2 })}` : '—'} />
        <Stat label="Day low" value={quote ? `$${formatNumber(quote.low, { maximumFractionDigits: 2 })}` : '—'} />
        <Stat label="Prev close" value={quote ? `$${formatNumber(quote.previousClose, { maximumFractionDigits: 2 })}` : '—'} />
        <Stat label="Volume" value={formatVolume(quote?.volume)} />
        <Stat
          label="As of"
          value={quote ? new Date(quote.asOf * 1000).toLocaleDateString() : '—'}
        />
      </div>

      {/* AI report area — never auto-runs; the Analyze button is the cost boundary. */}
      <ReportPanel symbol={symbol} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 text-base font-semibold text-text-primary">{value}</div>
    </div>
  );
}
