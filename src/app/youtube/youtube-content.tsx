'use client';

/**
 * YouTube home: search bar + results grid + inline IFrame player.
 * Uses the user's default connected account automatically.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';

interface PublicYouTubeAccount {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  hasSearchAccess: boolean;
  createdAt: string;
}

interface SearchItem {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string | null;
}

export function YouTubeContent(): React.ReactElement {
  const [accounts, setAccounts] = useState<PublicYouTubeAccount[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/youtube/accounts');
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = (await res.json()) as { accounts: PublicYouTubeAccount[] };
        setAccounts(data.accounts);
        const def = data.accounts.find((a) => a.isDefault) ?? data.accounts[0];
        if (def) setActiveAccountId(def.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts');
      }
    })();
  }, []);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;
      setSearching(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (activeAccountId) params.set('accountId', activeAccountId);
        const res = await fetch(`/api/youtube/search?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(body.message ?? body.error ?? `Search failed: ${res.status}`);
        }
        const data = (await res.json()) as { items: SearchItem[] };
        setResults(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    },
    [query, activeAccountId]
  );

  const noAccounts = accounts !== null && accounts.length === 0;
  const activeAccount = accounts?.find((account) => account.id === activeAccountId) ?? null;
  const needsReconnect = Boolean(activeAccount && !activeAccount.hasSearchAccess);

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">YouTube</h1>
          <div className="flex items-center gap-2">
            {accounts && accounts.length > 1 ? <select
                value={activeAccountId ?? ''}
                onChange={(e) => setActiveAccountId(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName ?? a.email ?? a.id}
                    {a.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select> : null}
            <Link
              href="/youtube/accounts"
              className="rounded border border-border px-3 py-1 text-sm hover:bg-accent"
            >
              Manage accounts
            </Link>
          </div>
        </div>

        {noAccounts ? <div className="mb-4 rounded border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
            No YouTube account connected yet.{' '}
            <Link href="/youtube/accounts" className="text-blue-400 hover:underline">
              Connect one
            </Link>{' '}
            to start searching and watching.
          </div> : null}
        {needsReconnect ? <div className="mb-4 rounded border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            This account was connected without YouTube search access.{' '}
            <Link href="/youtube/accounts" className="text-blue-400 hover:underline">
              Reconnect it from Manage accounts
            </Link>{' '}
            and accept the YouTube permission prompt.
          </div> : null}

        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search YouTube…"
            className="flex-1 rounded border border-border bg-background px-3 py-2"
            disabled={noAccounts || needsReconnect}
          />
          <button
            type="submit"
            disabled={searching || noAccounts || needsReconnect}
            className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error ? <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div> : null}

        {activeVideoId ? <div className="mb-6 aspect-video w-full overflow-hidden rounded border border-border bg-black">
            <iframe
              key={activeVideoId}
              src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1`}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="h-full w-full"
            />
          </div> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {results.map((item) => (
            <button
              type="button"
              key={item.videoId}
              onClick={() => setActiveVideoId(item.videoId)}
              className="text-left group"
            >
              <div className="aspect-video w-full overflow-hidden rounded bg-muted">
                {item.thumbnailUrl ? <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  /> : null}
              </div>
              <div
                className="mt-2 line-clamp-2 text-sm font-medium"
                dangerouslySetInnerHTML={{ __html: item.title }}
              />
              <div className="text-xs text-muted-foreground">{item.channelTitle}</div>
            </button>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
