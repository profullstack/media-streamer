'use client';

/**
 * Public VOD storefront: browse the catalog, buy a $1 weekly pass or a single
 * title, then watch (or download). Access is tied to an anonymous viewer cookie
 * set at checkout; after returning from CoinPay we poll the grant then refresh
 * access. See docs/prds/vod-monetization.md.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Provider {
  slug: string;
  title: string;
  description: string | null;
  weeklyPriceUsd: number | null;
  perTitlePriceUsd: number | null;
  passWindowMinutes: number;
  catalogCount: number;
  active: boolean;
}

interface Title {
  id: string;
  title: string;
  kind: string;
  posterUrl: string | null;
  plot: string | null;
  rating: string | null;
  category: string | null;
}

type AccessMode = 'stream' | 'download';

export function VodStorefront({ slug }: { slug: string }): React.ReactElement {
  const base = `/api/public/vod/${slug}`;
  const [provider, setProvider] = useState<Provider | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weeklyActive, setWeeklyActive] = useState(false);
  const [titleModes, setTitleModes] = useState<Record<string, AccessMode>>({});

  const [titles, setTitles] = useState<Title[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Title | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAccess = useCallback(async (): Promise<void> => {
    const res = await fetch(`${base}/access`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setWeeklyActive(Boolean(data.weeklyActive));
    const map: Record<string, AccessMode> = {};
    for (const t of data.titles ?? []) map[t.id] = t.mode;
    setTitleModes(map);
  }, [base]);

  const loadCatalog = useCallback(async (q: string, p: number): Promise<void> => {
    const res = await fetch(`${base}/catalog?q=${encodeURIComponent(q)}&page=${p}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setTitles(data.titles ?? []);
    setTotal(data.total ?? 0);
    setPage(data.page ?? 1);
    setPageSize(data.pageSize ?? 30);
  }, [base]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const res = await fetch(base, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setError('This library link is not available.');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setProvider(data.provider);
        setIsOwner(Boolean(data.isOwner));
        await Promise.all([loadAccess(), loadCatalog('', 1)]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, loadAccess, loadCatalog]);

  // After returning from CoinPay, poll the grant then refresh access.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const grantId = new URLSearchParams(window.location.search).get('grant');
    if (!grantId) return;
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 4;
      const res = await fetch(`${base}/grant/${grantId}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'paid') {
          await loadAccess();
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
      if (elapsed > 600 && pollRef.current) clearInterval(pollRef.current);
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [base, loadAccess]);

  const buy = useCallback(async (kind: 'weekly' | 'title', titleId?: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, titleId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start checkout.');
        return;
      }
      window.location.href = data.paymentUrl;
    } finally {
      setBusy(false);
    }
  }, [base]);

  const search = useCallback((): void => {
    void loadCatalog(query, 1);
  }, [loadCatalog, query]);

  const canPlay = (id: string): boolean => isOwner || weeklyActive || Boolean(titleModes[id]);
  const canDownload = (id: string): boolean => isOwner || titleModes[id] === 'download';

  if (loading) {
    return <main className="mx-auto max-w-6xl px-4 py-16 text-center text-text-secondary">Loading…</main>;
  }
  if (error && !provider) {
    return <main className="mx-auto max-w-6xl px-4 py-16 text-center text-red-500">{error}</main>;
  }
  if (!provider) return <main className="px-4 py-16" />;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-text-primary">{provider.title}</h1>
        {provider.description ? <p className="mt-1 text-text-secondary">{provider.description}</p> : null}
        <p className="mt-1 text-xs text-text-tertiary">{provider.catalogCount} titles</p>
      </header>

      {error ? (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{error}</div>
      ) : null}

      {/* Weekly pass bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-secondary p-3">
        {isOwner ? (
          <span className="text-sm text-text-secondary">You own this library — you watch everything free.</span>
        ) : weeklyActive ? (
          <span className="text-sm text-green-600">✓ Weekly pass active — the whole catalog is unlocked.</span>
        ) : provider.weeklyPriceUsd != null ? (
          <>
            <span className="text-sm text-text-secondary">
              Watch the whole catalog for {Math.round(provider.passWindowMinutes / 1440)} days.
            </span>
            <button
              className="ml-auto rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              onClick={() => void buy('weekly')}
              disabled={busy}
            >
              Buy weekly pass ${provider.weeklyPriceUsd.toFixed(2)}
            </button>
          </>
        ) : (
          <span className="text-sm text-text-secondary">Per-title purchases only.</span>
        )}
      </div>

      {/* Search */}
      <div className="mb-4 flex gap-2">
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          placeholder="Search titles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className="shrink-0 rounded-md bg-bg-hover px-4 py-2 text-sm text-text-primary" onClick={search}>
          Search
        </button>
      </div>

      {/* Player */}
      {selected ? <div className="mb-5 overflow-hidden rounded-lg border border-border bg-black">
          <div className="flex items-center justify-between bg-bg-secondary px-3 py-2">
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">{selected.title}</span>
            <button className="text-xs text-text-secondary hover:text-text-primary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          {canPlay(selected.id) ? (
            <>
              <video
                className="aspect-video w-full"
                controls
                autoPlay
                playsInline
                src={`${base}/stream?titleId=${encodeURIComponent(selected.id)}`}
              />
              {canDownload(selected.id) && (
                <a
                  className="block bg-bg-secondary px-3 py-2 text-center text-xs text-accent-primary hover:underline"
                  href={`${base}/download?titleId=${encodeURIComponent(selected.id)}`}
                >
                  Download file
                </a>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-text-secondary">Unlock this title to watch.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {provider.perTitlePriceUsd != null && (
                  <button
                    className="rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    onClick={() => void buy('title', selected.id)}
                    disabled={busy}
                  >
                    Buy this title ${provider.perTitlePriceUsd.toFixed(2)}
                  </button>
                )}
                {provider.weeklyPriceUsd != null && (
                  <button
                    className="rounded-md bg-bg-hover px-4 py-2 text-sm font-medium text-text-primary disabled:opacity-50"
                    onClick={() => void buy('weekly')}
                    disabled={busy}
                  >
                    Weekly pass ${provider.weeklyPriceUsd.toFixed(2)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div> : null}

      {/* Catalog grid */}
      {titles.length === 0 ? (
        <p className="text-sm text-text-secondary">No titles{query ? ' match your search' : ' yet'}.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {titles.map((t) => (
            <button
              key={t.id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-bg-secondary text-left transition-colors hover:border-accent-primary"
              onClick={() => setSelected(t)}
            >
              <div className="aspect-[2/3] w-full bg-bg-hover">
                {t.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.posterUrl} alt={t.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl text-text-tertiary">🎬</div>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-text-primary">{t.title}</p>
                {canPlay(t.id) ? (
                  <span className="text-[10px] text-green-600">Unlocked</span>
                ) : (
                  <span className="text-[10px] text-text-tertiary">Locked</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button
            className="rounded-md bg-bg-hover px-3 py-1.5 text-text-primary disabled:opacity-40"
            onClick={() => void loadCatalog(query, page - 1)}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span className="text-text-secondary">
            Page {page} / {totalPages}
          </span>
          <button
            className="rounded-md bg-bg-hover px-3 py-1.5 text-text-primary disabled:opacity-40"
            onClick={() => void loadCatalog(query, page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
