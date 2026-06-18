'use client';

/**
 * FinanceHub — symbol lookup, opportunities, watchlists, and recently viewed
 * (PRD §3.1). The watchlist UI (multiple named lists + live cards) lives in
 * WatchlistSection.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { BrokerConnect } from './broker-connect';
import { OpportunitiesPanel } from './opportunities-panel';
import { WatchlistSection } from './watchlist-section';

const RECENT_KEY = 'finance:recent';

export function FinanceHub(): React.ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      setRecent(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRecent([]);
    }
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

      <OpportunitiesPanel />

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

      <WatchlistSection />

      <BrokerConnect />
    </div>
  );
}
