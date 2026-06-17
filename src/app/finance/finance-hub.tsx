'use client';

/**
 * FinanceHub — symbol lookup, watchlist, and recently viewed (PRD §3.1).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { BrokerConnect } from './broker-connect';
import { Sparkline } from '@/components/finance/sparkline';
import type { WatchlistChanges } from '@/lib/finance/performance';

const RECENT_KEY = 'finance:recent';

interface WatchlistRow {
  id: string;
  symbol: string;
  exchange: string | null;
}

function PctChange({ label, value }: { label: string; value: number | null }): React.ReactElement {
  const known = value !== null && Number.isFinite(value);
  const up = known && (value as number) >= 0;
  const color = !known ? 'text-text-muted' : up ? 'text-green-400' : 'text-red-400';
  const text = !known ? '—' : `${up ? '+' : ''}${(value as number).toFixed(2)}%`;
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${color}`}>{text}</span>
    </div>
  );
}

export function FinanceHub(): React.ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [bulk, setBulk] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [changes, setChanges] = useState<Record<string, WatchlistChanges>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      setRecent(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRecent([]);
    }
  }, []);

  const loadWatchlist = useCallback(() => {
    fetch('/api/finance/watchlist', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { watchlist: [] }))
      .then((body: { watchlist?: WatchlistRow[] }) => setWatchlist(body.watchlist ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // Fetch last-week sparkline samples for the watchlist symbols (one batch call).
  const watchlistKey = watchlist.map((w) => w.symbol).join(',');
  useEffect(() => {
    if (!watchlistKey) {
      setSparklines({});
      return;
    }
    let cancelled = false;
    fetch(`/api/finance/sparklines?symbols=${encodeURIComponent(watchlistKey)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { samples: {} }))
      .then((body: { samples?: Record<string, number[]> }) => {
        if (!cancelled) setSparklines(body.samples ?? {});
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [watchlistKey]);

  // Fetch trailing 1/5/30-day % changes for the watchlist symbols.
  useEffect(() => {
    if (!watchlistKey) {
      setChanges({});
      return;
    }
    let cancelled = false;
    fetch(`/api/finance/watchlist/changes?symbols=${encodeURIComponent(watchlistKey)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { changes: {} }))
      .then((body: { changes?: Record<string, WatchlistChanges> }) => {
        if (!cancelled) setChanges(body.changes ?? {});
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [watchlistKey]);

  const addBulk = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!bulk.trim()) return;
      setBulkBusy(true);
      setBulkMsg(null);
      try {
        const res = await fetch('/api/finance/watchlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbols: bulk }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setBulkMsg(body.error === 'no valid symbols' ? 'No valid tickers found.' : 'Could not add tickers.');
          return;
        }
        const added = body.count ?? 0;
        const invalid: string[] = body.invalid ?? [];
        setBulkMsg(
          `Added ${added} ticker${added === 1 ? '' : 's'}` +
            (invalid.length ? ` · skipped ${invalid.length} invalid (${invalid.slice(0, 5).join(', ')})` : ''),
        );
        setBulk('');
        loadWatchlist();
      } catch {
        setBulkMsg('Network error.');
      } finally {
        setBulkBusy(false);
      }
    },
    [bulk, loadWatchlist],
  );

  const go = useCallback(
    (raw: string) => {
      const symbol = normalizeSymbol(raw);
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) return;
      router.push(`/finance/ticker/${symbol}`);
    },
    [router],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold text-text-primary">Finance</h1>
      <p className="mt-1 text-text-muted">
        Look up any stock or ETF for a price chart, key stats, and on-demand AI research.
      </p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(query);
        }}
      >
        <input
          className="input flex-1"
          placeholder="Search a ticker, e.g. NVDA, AAPL, SPY"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary">
          View
        </button>
      </form>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
            Recently viewed
          </h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((symbol) => (
              <Link
                key={symbol}
                href={`/finance/ticker/${symbol}`}
                className="rounded-md bg-bg-tertiary px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover"
              >
                {symbol}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
          Watchlist
        </h2>

        <form onSubmit={addBulk} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="Paste tickers to add, e.g. NVDA, AAPL, TSLA, SPY"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" disabled={bulkBusy || !bulk.trim()} className="btn btn-secondary disabled:opacity-60">
            {bulkBusy ? 'Adding…' : 'Add all'}
          </button>
        </form>
        {bulkMsg ? <p className="mb-3 text-xs text-text-muted">{bulkMsg}</p> : null}

        {watchlist.length === 0 ? (
          <p className="text-sm text-text-muted">
            No tickers yet. Open a ticker and tap “Add to watchlist”.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {watchlist.map((row) => (
              <Link key={row.id} href={`/finance/ticker/${row.symbol}`} className="card p-4 hover:bg-bg-tertiary">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-semibold text-text-primary">{row.symbol}</div>
                  <Sparkline samples={sparklines[row.symbol]} width={56} />
                </div>
                {row.exchange ? <div className="text-xs text-text-muted">{row.exchange}</div> : null}
                <div className="mt-3 flex items-center justify-between gap-1 border-t border-border-primary pt-2">
                  <PctChange label="1D" value={changes[row.symbol]?.d1 ?? null} />
                  <PctChange label="5D" value={changes[row.symbol]?.d5 ?? null} />
                  <PctChange label="30D" value={changes[row.symbol]?.d30 ?? null} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <BrokerConnect />
    </div>
  );
}
