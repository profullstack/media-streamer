'use client';

/**
 * Live TV → Rent Out
 *
 * List an IPTV playlist you already pay for, priced by the game. A buyer pays via
 * CoinPay for a time-boxed pass and watches through our proxy; your provider
 * credentials never leave the server.
 *
 * The control that matters most here is concurrency. A provider subscription
 * allows a fixed number of simultaneous connections, and exceeding it does not
 * merely degrade playback — it is what gets an account terminated. So the form
 * leads with it and defaults to 1.
 */

import { useCallback, useEffect, useState } from 'react';

interface Playlist {
  id: string;
  name: string;
  isActive: boolean;
}

interface Share {
  id: string;
  slug: string;
  playlistId: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  maxConcurrentStreams: number;
  maxActivePasses: number;
  status: 'active' | 'paused' | 'expired' | 'closed';
  sessionCount: number;
  earningsUsd: number;
  createdAt: string;
}

const input =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none';
const label = 'block text-xs font-medium text-text-secondary mb-1';
const btn =
  'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';

const STATUS_STYLE: Record<Share['status'], string> = {
  active: 'bg-green-500/10 text-green-500',
  paused: 'bg-yellow-500/10 text-yellow-500',
  expired: 'bg-text-tertiary/10 text-text-tertiary',
  closed: 'bg-red-500/10 text-red-500',
};

export function IptvRentOut(): React.ReactElement {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [playlistId, setPlaylistId] = useState('');
  const [title, setTitle] = useState('Watch on my line');
  const [priceUsd, setPriceUsd] = useState('1.00');
  const [windowMinutes, setWindowMinutes] = useState('240');
  const [concurrency, setConcurrency] = useState('1');
  const [maxPasses, setMaxPasses] = useState('3');

  const load = useCallback(async () => {
    try {
      const [pl, sh] = await Promise.all([
        fetch('/api/iptv/playlists', { cache: 'no-store' }),
        fetch('/api/iptv/shares', { cache: 'no-store' }),
      ]);
      if (pl.ok) {
        const data = await pl.json();
        const list: Playlist[] = data.playlists ?? [];
        setPlaylists(list);
        setPlaylistId((cur) => cur || list[0]?.id || '');
      }
      if (sh.ok) setShares((await sh.json()).shares ?? []);
      else if (sh.status === 401) setError('Sign in to list a line for resale.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/iptv/shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playlistId,
          title,
          priceUsd: Number(priceUsd),
          passWindowMinutes: Number(windowMinutes),
          maxConcurrentStreams: Number(concurrency),
          maxActivePasses: Number(maxPasses),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not create that listing.');
      setShares((s) => [data.share, ...s]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(share: Share, status: Share['status']): Promise<void> {
    const res = await fetch(`/api/iptv/shares/${share.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setShares((list) => list.map((s) => (s.id === share.id ? data.share : s)));
    }
  }

  async function remove(share: Share): Promise<void> {
    const res = await fetch(`/api/iptv/shares/${share.id}`, { method: 'DELETE' });
    if (res.ok) setShares((list) => list.filter((s) => s.id !== share.id));
  }

  if (loading) return <main className="p-8 text-text-secondary">Loading…</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">Rent out your line</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Sell access to a playlist you already pay for, by the game. Buyers watch through
        our proxy — they never see your provider credentials.
      </p>

      {error ? (
        <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      ) : null}

      {playlists.length === 0 ? (
        <p className="mt-6 text-sm text-text-tertiary">
          Add an IPTV playlist first, then come back to list it.
        </p>
      ) : (
        <section className="mt-6 rounded-lg border border-border p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="pl">
                Playlist
              </label>
              <select
                id="pl"
                className={input}
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
              >
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={label} htmlFor="t">
                Title
              </label>
              <input id="t" className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <label className={label} htmlFor="p">
                Price (USD)
              </label>
              <input id="p" className={input} value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} />
            </div>

            <div>
              <label className={label} htmlFor="w">
                Pass length (minutes)
              </label>
              <input
                id="w"
                className={input}
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-tertiary">Capped at 24 hours.</p>
            </div>

            <div>
              <label className={label} htmlFor="c">
                Simultaneous streams
              </label>
              <input
                id="c"
                className={input}
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
              />
              <p className="mt-1 text-xs text-yellow-500">
                Never set this above what your provider allows, minus your own viewing.
                Overselling is what gets accounts terminated.
              </p>
            </div>

            <div>
              <label className={label} htmlFor="m">
                Passes live at once
              </label>
              <input
                id="m"
                className={input}
                value={maxPasses}
                onChange={(e) => setMaxPasses(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-tertiary">
                Buyers rarely all watch at the same moment, so this is usually higher.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={create}
            disabled={saving || !playlistId}
            className={`${btn} mt-4 bg-accent-primary text-white`}
          >
            {saving ? 'Creating…' : 'Create listing'}
          </button>
        </section>
      )}

      <h2 className="mt-8 text-lg font-medium text-text-primary">Your listings</h2>
      {shares.length === 0 ? (
        <p className="mt-2 text-sm text-text-tertiary">Nothing listed yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {shares.map((s) => (
            <li key={s.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-text-primary">{s.title}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[s.status]}`}>
                  {s.status}
                </span>
                <span className="ml-auto text-sm text-text-secondary">
                  ${Number(s.priceUsd).toFixed(2)} · {s.maxConcurrentStreams} stream
                  {s.maxConcurrentStreams === 1 ? '' : 's'}
                </span>
              </div>

              <p className="mt-2 text-xs text-text-tertiary">
                Share this link: <code className="text-text-secondary">/watch/{s.slug}</code>
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {s.sessionCount} session{s.sessionCount === 1 ? '' : 's'} · $
                {Number(s.earningsUsd).toFixed(2)} earned
              </p>

              <div className="mt-3 flex gap-2">
                <a className={`${btn} border border-border`} href={`/watch/${s.slug}`}>
                  Open
                </a>
                {s.status === 'active' ? (
                  <button type="button" className={`${btn} border border-border`} onClick={() => setStatus(s, 'paused')}>
                    Pause
                  </button>
                ) : (
                  <button type="button" className={`${btn} border border-border`} onClick={() => setStatus(s, 'active')}>
                    Resume
                  </button>
                )}
                <button type="button" className={`${btn} border border-border text-red-500`} onClick={() => remove(s)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
