'use client';

/**
 * WatchlistSection — multiple named watchlists with full CRUD (PRD §3.1).
 *
 * Lists are selectable tabs; the active list's tickers render as live cards
 * (last price + session + 1/5/30-day change), polled while the tab is visible.
 * Create / rename / delete operate on the lists; bulk-add and the chart data
 * (sparklines / changes / quotes) are scoped to the active list's symbols.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkline } from '@/components/finance/sparkline';
import { MarketSessionBadge } from '@/components/finance/market-session';
import { useVisibleInterval } from '@/lib/finance/use-visible-interval';
import { MAX_WATCHLIST_NAME } from '@/lib/finance/watchlist';
import type { WatchlistChanges } from '@/lib/finance/performance';
import type { Quote } from '@/lib/finance/market-data/types';

/** Live-quote poll cadence (ms) while the tab is visible. */
const QUOTE_POLL_MS = 20_000;

interface WatchlistRow {
  id: string;
  symbol: string;
  exchange: string | null;
}

interface WatchlistSummary {
  id: string;
  name: string;
  createdAt: string;
  count: number;
}

function formatPrice(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export function WatchlistSection(): React.ReactElement {
  const [lists, setLists] = useState<WatchlistSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [changes, setChanges] = useState<Record<string, WatchlistChanges>>({});
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const [bulk, setBulk] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // List CRUD UI state.
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Load the lists; keep/choose a sensible active list.
  const loadLists = useCallback(async (): Promise<WatchlistSummary[]> => {
    const res = await fetch('/api/finance/watchlists', { cache: 'no-store' });
    const body = (res.ok ? await res.json() : { watchlists: [] }) as { watchlists?: WatchlistSummary[] };
    const next = body.watchlists ?? [];
    setLists(next);
    return next;
  }, []);

  useEffect(() => {
    loadLists()
      .then((next) => setActiveId((cur) => (cur && next.some((l) => l.id === cur) ? cur : next[0]?.id ?? null)))
      .catch(() => undefined);
  }, [loadLists]);

  // Load the active list's items.
  const loadItems = useCallback(() => {
    if (!activeId) {
      setWatchlist([]);
      return;
    }
    fetch(`/api/finance/watchlist?watchlistId=${encodeURIComponent(activeId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { watchlist: [] }))
      .then((body: { watchlist?: WatchlistRow[] }) => setWatchlist(body.watchlist ?? []))
      .catch(() => undefined);
  }, [activeId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const watchlistKey = watchlist.map((w) => w.symbol).join(',');

  // Sparkline samples for the active list's symbols (one batch call).
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

  // Trailing 1/5/30-day % changes.
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

  // Live last price + session per symbol; polled while visible.
  const loadQuotes = useCallback(() => {
    if (!watchlistKey) {
      setQuotes({});
      return;
    }
    fetch(`/api/finance/quotes?symbols=${encodeURIComponent(watchlistKey)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { quotes: {} }))
      .then((body: { quotes?: Record<string, Quote> }) => setQuotes(body.quotes ?? {}))
      .catch(() => undefined);
  }, [watchlistKey]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  const anyLive = Object.values(quotes).some((q) => q.marketState && q.marketState !== 'CLOSED');
  useVisibleInterval(loadQuotes, QUOTE_POLL_MS, watchlistKey.length > 0 && anyLive);

  const activeList = lists.find((l) => l.id === activeId) ?? null;

  // --- List CRUD ------------------------------------------------------------
  const createList = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/finance/watchlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { watchlist: WatchlistSummary };
      setNewName('');
      setCreating(false);
      await loadLists();
      setActiveId(body.watchlist.id);
    } catch {
      // non-fatal
    }
  }, [newName, loadLists]);

  const renameList = useCallback(async () => {
    const name = renameValue.trim();
    if (!activeId || !name) return;
    try {
      const res = await fetch(`/api/finance/watchlists/${activeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      setRenaming(false);
      await loadLists();
    } catch {
      // non-fatal
    }
  }, [activeId, renameValue, loadLists]);

  const deleteList = useCallback(async () => {
    if (!activeId || !activeList) return;
    if (!window.confirm(`Delete "${activeList.name}" and its tickers? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/finance/watchlists/${activeId}`, { method: 'DELETE' });
      if (!res.ok) return;
      const next = await loadLists();
      setActiveId(next[0]?.id ?? null);
    } catch {
      // non-fatal
    }
  }, [activeId, activeList, loadLists]);

  // --- Add tickers ----------------------------------------------------------
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
          // activeId may be null for a brand-new user — the server then creates
          // (and returns) the default list, which we adopt below.
          body: JSON.stringify(activeId ? { symbols: bulk, watchlistId: activeId } : { symbols: bulk }),
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
        const next = await loadLists();
        const targetId = (body.watchlistId as string) ?? activeId ?? next[0]?.id ?? null;
        setActiveId(targetId);
        if (targetId === activeId) loadItems();
      } catch {
        setBulkMsg('Network error.');
      } finally {
        setBulkBusy(false);
      }
    },
    [bulk, activeId, loadLists, loadItems],
  );

  const removeSymbol = useCallback(
    async (symbol: string) => {
      if (!activeId) return;
      // optimistic
      setWatchlist((cur) => cur.filter((r) => r.symbol !== symbol));
      try {
        await fetch(
          `/api/finance/watchlist?symbol=${encodeURIComponent(symbol)}&watchlistId=${encodeURIComponent(activeId)}`,
          { method: 'DELETE' },
        );
        loadLists();
      } catch {
        loadItems(); // revert via refetch
      }
    },
    [activeId, loadLists, loadItems],
  );

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Watchlists</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => {
                setActiveId(list.id);
                setRenaming(false);
              }}
              className={`rounded-full px-3 py-1 text-sm transition ${
                list.id === activeId
                  ? 'bg-bg-active text-text-primary'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {list.name}
              <span className="ml-1.5 text-xs text-text-muted">{list.count}</span>
            </button>
          ))}
          {creating ? (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                className="input h-8 w-36 text-sm"
                placeholder="List name"
                value={newName}
                maxLength={MAX_WATCHLIST_NAME}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createList();
                  if (e.key === 'Escape') setCreating(false);
                }}
              />
              <button type="button" onClick={() => void createList()} className="btn btn-primary h-8 px-2 text-xs">
                Add
              </button>
              <button type="button" onClick={() => setCreating(false)} className="text-xs text-text-muted hover:underline">
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setNewName('');
              }}
              className="rounded-full border border-dashed border-border-primary px-3 py-1 text-sm text-text-muted hover:text-text-secondary"
            >
              + New list
            </button>
          )}
        </div>
      </div>

      {/* Active-list controls: rename / delete */}
      {activeList ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
          {renaming ? (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                className="input h-8 w-44 text-sm"
                value={renameValue}
                maxLength={MAX_WATCHLIST_NAME}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void renameList();
                  if (e.key === 'Escape') setRenaming(false);
                }}
              />
              <button type="button" onClick={() => void renameList()} className="btn btn-primary h-8 px-2 text-xs">
                Save
              </button>
              <button type="button" onClick={() => setRenaming(false)} className="text-text-muted hover:underline">
                Cancel
              </button>
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setRenaming(true);
                  setRenameValue(activeList.name);
                }}
                className="text-text-muted hover:text-text-secondary hover:underline"
              >
                Rename
              </button>
              <button type="button" onClick={() => void deleteList()} className="text-red-400 hover:underline">
                Delete list
              </button>
            </>
          )}
        </div>
      ) : null}

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
          {lists.length === 0
            ? 'No watchlists yet. Paste some tickers above to start one, or create a named list.'
            : 'No tickers in this list yet. Paste some above, or open a ticker and tap “Add to watchlist”.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {watchlist.map((row) => {
            const quote = quotes[row.symbol];
            // Prefer the live intraday day-change for 1D; fall back to the
            // candle-derived trailing change before the quote loads.
            const d1 = quote ? quote.changePercent : changes[row.symbol]?.d1 ?? null;
            return (
              <div key={row.id} className="card group relative p-4 hover:bg-bg-tertiary">
                <button
                  type="button"
                  onClick={() => void removeSymbol(row.symbol)}
                  aria-label={`Remove ${row.symbol}`}
                  className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-red-400 group-hover:flex"
                >
                  ×
                </button>
                <Link href={`/finance/ticker/${row.symbol}`} className="block">
                  <div className="flex items-center justify-between gap-2 pr-5">
                    <div className="text-lg font-semibold text-text-primary">{row.symbol}</div>
                    <Sparkline samples={sparklines[row.symbol]} width={56} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-base font-semibold tabular-nums text-text-primary">
                      {formatPrice(quote?.price)}
                    </span>
                    <MarketSessionBadge state={quote?.marketState} />
                  </div>
                  {row.exchange ? <div className="text-xs text-text-muted">{row.exchange}</div> : null}
                  <div className="mt-3 flex items-center justify-between gap-1 border-t border-border-primary pt-2">
                    <PctChange label="1D" value={d1} />
                    <PctChange label="5D" value={changes[row.symbol]?.d5 ?? null} />
                    <PctChange label="30D" value={changes[row.symbol]?.d30 ?? null} />
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
