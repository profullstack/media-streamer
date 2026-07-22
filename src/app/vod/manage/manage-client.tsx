'use client';

/**
 * VOD Providers → manage. Connect a source, price it, sync the catalog, and get
 * a public /vod/<slug> link. See docs/prds/vod-monetization.md.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon, LoadingSpinner, TrashIcon, CreditCardIcon } from '@/components/ui/icons';

type SourceKind = 'xtream' | 'm3u' | 'http_library' | 'manifest';
type SourceAuth = 'none' | 'bearer' | 'basic' | 'header';

interface Provider {
  id: string;
  slug: string;
  title: string;
  sourceKind: SourceKind;
  status: 'active' | 'paused' | 'closed';
  weeklyPriceUsd: number | null;
  perTitlePriceUsd: number | null;
  defaultAccessMode: 'stream' | 'download';
  catalogCount: number;
  lastSyncedAt: string | null;
  sessionCount: number;
  earningsUsd: number;
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none';
const labelCls = 'block text-xs font-medium text-text-secondary mb-1';
const btn =
  'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';

const STATUS_STYLE: Record<Provider['status'], string> = {
  active: 'bg-green-500/10 text-green-500',
  paused: 'bg-yellow-500/10 text-yellow-500',
  closed: 'bg-red-500/10 text-red-500',
};

const SOURCE_LABEL: Record<SourceKind, string> = {
  xtream: 'Xtream Codes',
  m3u: 'M3U playlist',
  http_library: 'HTTP media library',
  manifest: 'JSON manifest',
};

export function VodManageClient(): React.ReactElement {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Connect form
  const [title, setTitle] = useState('My VOD library');
  const [sourceKind, setSourceKind] = useState<SourceKind>('xtream');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceUsername, setSourceUsername] = useState('');
  const [sourcePassword, setSourcePassword] = useState('');
  const [sourceAuth, setSourceAuth] = useState<SourceAuth>('none');
  const [sourceToken, setSourceToken] = useState('');
  const [sourceHeaderName, setSourceHeaderName] = useState('');
  const [weeklyPrice, setWeeklyPrice] = useState('1');
  const [perTitlePrice, setPerTitlePrice] = useState('1');
  const [defaultAccessMode, setDefaultAccessMode] = useState<'stream' | 'download'>('stream');
  const [payoutWallet, setPayoutWallet] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch('/api/vod/providers', { cache: 'no-store' });
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch {
      setError('Could not load your providers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const priceOrNull = (v: string): number | null => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };

  const create = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/vod/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sourceKind,
          sourceUrl,
          sourceUsername: sourceUsername || null,
          sourcePassword: sourcePassword || null,
          sourceAuth,
          sourceToken: sourceToken || null,
          sourceHeaderName: sourceHeaderName || null,
          weeklyPriceUsd: priceOrNull(weeklyPrice),
          perTitlePriceUsd: priceOrNull(perTitlePrice),
          defaultAccessMode,
          payoutWalletAddress: payoutWallet.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not connect the source.');
        return;
      }
      setSourceUrl('');
      setSourcePassword('');
      setSourceToken('');
      await load();
      setNotice('Connected. Now sync the catalog.');
    } finally {
      setBusy(false);
    }
  }, [
    title, sourceKind, sourceUrl, sourceUsername, sourcePassword, sourceAuth, sourceToken,
    sourceHeaderName, weeklyPrice, perTitlePrice, defaultAccessMode, payoutWallet, load,
  ]);

  const sync = useCallback(async (id: string): Promise<void> => {
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/vod/providers/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Sync failed.');
        return;
      }
      const r = data.result;
      setNotice(`Synced ${r.total} titles${r.truncated ? ' (capped)' : ''}.`);
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const patchStatus = useCallback(async (id: string, status: Provider['status']): Promise<void> => {
    await fetch(`/api/vod/providers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  }, [load]);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (!confirm('Delete this provider and its catalog? Active passes stop working.')) return;
    await fetch(`/api/vod/providers/${id}`, { method: 'DELETE' });
    await load();
  }, [load]);

  const copyLink = useCallback((slug: string): void => {
    void navigator.clipboard.writeText(`${window.location.origin}/vod/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-secondary">
        <LoadingSpinner /> Loading providers…
      </div>
    );
  }

  const needsAuthFields = sourceKind !== 'xtream';

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600">{notice}</div>
      ) : null}

      <section className="rounded-lg border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Connect a source</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Library title</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Source type</label>
            <select className={inputCls} value={sourceKind} onChange={(e) => setSourceKind(e.target.value as SourceKind)}>
              <option value="xtream">Xtream Codes</option>
              <option value="m3u">M3U playlist</option>
              <option value="http_library">HTTP media library</option>
              <option value="manifest">JSON manifest</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>
              {sourceKind === 'xtream' ? 'Server URL' : sourceKind === 'http_library' ? 'Base URL' : 'Playlist / manifest URL'}
            </label>
            <input className={inputCls} placeholder="https://…" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </div>

          {sourceKind === 'xtream' && (
            <>
              <div>
                <label className={labelCls}>Username</label>
                <input className={inputCls} value={sourceUsername} onChange={(e) => setSourceUsername(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Password</label>
                <input className={inputCls} type="password" value={sourcePassword} onChange={(e) => setSourcePassword(e.target.value)} />
              </div>
            </>
          )}

          {needsAuthFields ? <div>
              <label className={labelCls}>Auth</label>
              <select className={inputCls} value={sourceAuth} onChange={(e) => setSourceAuth(e.target.value as SourceAuth)}>
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="basic">Basic (user + pass)</option>
                <option value="header">Custom header</option>
              </select>
            </div> : null}
          {needsAuthFields && (sourceAuth === 'bearer' || sourceAuth === 'header') ? <div>
              <label className={labelCls}>Token</label>
              <input className={inputCls} type="password" value={sourceToken} onChange={(e) => setSourceToken(e.target.value)} />
            </div> : null}
          {needsAuthFields && sourceAuth === 'header' ? <div>
              <label className={labelCls}>Header name</label>
              <input className={inputCls} placeholder="X-Api-Key" value={sourceHeaderName} onChange={(e) => setSourceHeaderName(e.target.value)} />
            </div> : null}
          {needsAuthFields && sourceAuth === 'basic' ? <>
              <div>
                <label className={labelCls}>Basic user</label>
                <input className={inputCls} value={sourceUsername} onChange={(e) => setSourceUsername(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Basic password</label>
                <input className={inputCls} type="password" value={sourcePassword} onChange={(e) => setSourcePassword(e.target.value)} />
              </div>
            </> : null}

          <div>
            <label className={labelCls}>Weekly price (USD, blank = off)</label>
            <input className={inputCls} type="number" min="0.25" step="0.25" value={weeklyPrice} onChange={(e) => setWeeklyPrice(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Per-title price (USD, blank = off)</label>
            <input className={inputCls} type="number" min="0.25" step="0.25" value={perTitlePrice} onChange={(e) => setPerTitlePrice(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Per-title unlock grants</label>
            <select className={inputCls} value={defaultAccessMode} onChange={(e) => setDefaultAccessMode(e.target.value as 'stream' | 'download')}>
              <option value="stream">Streaming</option>
              <option value="download">File download</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Payout wallet (optional)</label>
            <input className={inputCls} placeholder="your SOL address" value={payoutWallet} onChange={(e) => setPayoutWallet(e.target.value)} />
          </div>
        </div>
        <button className={cn(btn, 'mt-4 bg-accent-primary text-white hover:opacity-90')} onClick={() => void create()} disabled={busy}>
          {busy ? <LoadingSpinner /> : <CreditCardIcon size={16} />}
          Connect source
        </button>
        <p className="mt-2 text-xs text-text-tertiary">
          By connecting, you confirm you have the rights to distribute this catalog. Secrets are encrypted at rest.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Your providers</h3>
        {providers.length === 0 && <p className="text-sm text-text-secondary">No providers yet.</p>}
        {providers.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-bg-secondary p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{p.title}</span>
                  <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_STYLE[p.status])}>{p.status}</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {SOURCE_LABEL[p.sourceKind]} · {p.catalogCount} titles ·{' '}
                  {p.weeklyPriceUsd != null ? `$${p.weeklyPriceUsd.toFixed(2)}/wk` : 'no weekly'} ·{' '}
                  {p.perTitlePriceUsd != null ? `$${p.perTitlePriceUsd.toFixed(2)}/title` : 'no per-title'} ·{' '}
                  {p.sessionCount} sale{p.sessionCount === 1 ? '' : 's'} · ${p.earningsUsd.toFixed(2)} earned
                </p>
                <button
                  className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline"
                  onClick={() => copyLink(p.slug)}
                >
                  {copied === p.slug ? <CheckIcon size={14} /> : null}
                  {copied === p.slug ? 'Link copied' : `/vod/${p.slug} — copy link`}
                </button>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button className={cn(btn, 'bg-accent-primary/10 text-accent-primary')} onClick={() => void sync(p.id)} disabled={busy}>
                  Sync catalog
                </button>
                {p.status === 'active' && (
                  <button className={cn(btn, 'bg-bg-hover text-text-primary')} onClick={() => void patchStatus(p.id, 'paused')}>Pause</button>
                )}
                {p.status === 'paused' && (
                  <button className={cn(btn, 'bg-bg-hover text-text-primary')} onClick={() => void patchStatus(p.id, 'active')}>Resume</button>
                )}
                {p.status !== 'closed' && (
                  <button className={cn(btn, 'bg-bg-hover text-text-primary')} onClick={() => void patchStatus(p.id, 'closed')}>Close</button>
                )}
                <button className={cn(btn, 'bg-red-500/10 text-red-500 hover:bg-red-500/20')} onClick={() => void remove(p.id)} aria-label="Delete provider">
                  <TrashIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
