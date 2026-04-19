'use client';

/**
 * YouTube home: search bar + results grid + inline IFrame player.
 * Uses the user's default connected account automatically.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { LoadingSpinner, SearchIcon } from '@/components/ui/icons';

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

function formatPublishedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

export function YouTubeContent(): React.ReactElement {
  const [accounts, setAccounts] = useState<PublicYouTubeAccount[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<SearchItem | null>(null);
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
        setActiveVideo((current) =>
          data.items.find((item) => item.videoId === current?.videoId) ?? current
        );
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
                className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
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
              className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-hover"
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

        <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <SearchIcon className="text-text-muted" size={18} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search YouTube…"
              className="w-full rounded-lg border border-border-default bg-bg-secondary py-3 pl-11 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              disabled={noAccounts || needsReconnect}
            />
          </div>
          <button
            type="submit"
            disabled={searching || noAccounts || needsReconnect}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50 md:min-w-[140px]"
          >
            {searching ? <>
                <LoadingSpinner className="text-white" size={18} />
                <span>Searching…</span>
              </> : <>
                <SearchIcon className="text-white" size={18} />
                <span>Search</span>
              </>}
          </button>
        </form>

        {error ? <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div> : null}

        {activeVideo ? <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
            <div className="aspect-video w-full overflow-hidden bg-black">
              <iframe
                key={activeVideo.videoId}
                src={`https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1`}
                title="YouTube video player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
            <div className="border-t border-border p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold leading-tight">{activeVideo.title}</h2>
                  <dl className="mt-3 grid gap-x-3 gap-y-2 text-sm text-muted-foreground sm:grid-cols-[auto_1fr]">
                    <dt className="font-medium text-foreground">Channel</dt>
                    <dd>
                      <a
                        href={`https://www.youtube.com/channel/${activeVideo.channelId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground hover:underline"
                      >
                        {activeVideo.channelTitle}
                      </a>
                    </dd>
                    <dt className="font-medium text-foreground">Published</dt>
                    <dd>{formatPublishedAt(activeVideo.publishedAt)}</dd>
                  </dl>
                </div>
                <a
                  href={`https://www.youtube.com/watch?v=${activeVideo.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center rounded border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  Open on YouTube
                </a>
              </div>
              <div className="mt-4">
                <h3 className="text-sm font-medium">Description</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {activeVideo.description || 'No description available.'}
                </p>
              </div>
            </div>
          </div> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {results.map((item) => (
            <button
              type="button"
              key={item.videoId}
              onClick={() => setActiveVideo(item)}
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
