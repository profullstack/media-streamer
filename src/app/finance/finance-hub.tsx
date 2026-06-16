'use client';

/**
 * FinanceHub — symbol lookup, watchlist, and recently viewed (PRD §3.1).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { BrokerConnect } from './broker-connect';

const RECENT_KEY = 'finance:recent';

interface WatchlistRow {
  id: string;
  symbol: string;
  exchange: string | null;
}

export function FinanceHub(): React.ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      setRecent(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    fetch('/api/finance/watchlist', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { watchlist: [] }))
      .then((body: { watchlist?: WatchlistRow[] }) => setWatchlist(body.watchlist ?? []))
      .catch(() => undefined);
  }, []);

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
        {watchlist.length === 0 ? (
          <p className="text-sm text-text-muted">
            No tickers yet. Open a ticker and tap “Add to watchlist”.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {watchlist.map((row) => (
              <Link key={row.id} href={`/finance/ticker/${row.symbol}`} className="card p-4 hover:bg-bg-tertiary">
                <div className="text-lg font-semibold text-text-primary">{row.symbol}</div>
                {row.exchange ? <div className="text-xs text-text-muted">{row.exchange}</div> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <BrokerConnect />
    </div>
  );
}
