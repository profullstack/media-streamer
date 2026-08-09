'use client';

/**
 * Seedboxes → Rent Out
 *
 * Publish a temporary, public rental of your seedbox. A visitor pays $0.25 via
 * CoinPay for a time-boxed session pass, submits their own magnet, your box
 * downloads it, and they stream it back. You keep control: pause/close anytime,
 * per-pass download caps, session expiry. See docs/prds/seedbox-pay-per-watch.md.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon, LoadingSpinner, TrashIcon, CreditCardIcon } from '@/components/ui/icons';

interface Rental {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  maxDownloadsPerPass: number;
  status: 'active' | 'paused' | 'expired' | 'closed';
  expiresAt: string | null;
  payoutWalletAddress: string | null;
  sessionCount: number;
  earningsUsd: number;
  createdAt: string;
}

interface ReadyState {
  ready: boolean;
  reason?: string;
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none';
const labelCls = 'block text-xs font-medium text-text-secondary mb-1';
const btn =
  'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';

const STATUS_STYLE: Record<Rental['status'], string> = {
  active: 'bg-green-500/10 text-green-500',
  paused: 'bg-yellow-500/10 text-yellow-500',
  expired: 'bg-text-tertiary/10 text-text-tertiary',
  closed: 'bg-red-500/10 text-red-500',
};

function hasLapsed(rental: Rental): boolean {
  return !!rental.expiresAt && new Date(rental.expiresAt).getTime() <= Date.now();
}

/**
 * What the public /rent page actually does with this rental. A lapsed
 * `expiresAt` closes the link while the stored status stays 'active', so
 * showing the raw status would tell the owner their dead link is fine.
 */
function effectiveStatus(rental: Rental): Rental['status'] {
  if (rental.status === 'active' && hasLapsed(rental)) return 'expired';
  return rental.status;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function RentOut(): React.ReactElement {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [ready, setReady] = useState<ReadyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Create form
  const [title, setTitle] = useState('Rent my seedbox');
  const [price, setPrice] = useState('0.25');
  const [windowHours, setWindowHours] = useState('24');
  const [maxDownloads, setMaxDownloads] = useState('2');
  // Default to never: a lapsed rental silently stops taking payments, and an
  // owner who wants a deadline can still set one.
  const [expiryDays, setExpiryDays] = useState('0');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [payoutChain, setPayoutChain] = useState('SOL');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch('/api/seedbox/shares', { cache: 'no-store' });
      const data = await res.json();
      setRentals(data.rentals ?? []);
      setReady(data.ready ?? null);
    } catch {
      setError('Could not load your rentals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async (): Promise<void> => {
    setCreating(true);
    setError(null);
    try {
      const expiresAt =
        Number(expiryDays) > 0
          ? new Date(Date.now() + Number(expiryDays) * 86400_000).toISOString()
          : null;
      const res = await fetch('/api/seedbox/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priceUsd: Number(price),
          passWindowMinutes: Math.round(Number(windowHours) * 60),
          maxDownloadsPerPass: Number(maxDownloads),
          expiresAt,
          payoutWalletAddress: payoutWallet.trim() || null,
          payoutBlockchain: payoutWallet.trim() ? payoutChain : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not create the rental.');
        return;
      }
      await load();
    } finally {
      setCreating(false);
    }
  }, [title, price, windowHours, maxDownloads, expiryDays, payoutWallet, payoutChain, load]);

  const patchRental = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<void> => {
      await fetch(`/api/seedbox/shares/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await load();
    },
    [load]
  );

  const patchStatus = useCallback(
    (id: string, status: Rental['status']): Promise<void> => patchRental(id, { status }),
    [patchRental]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!confirm('Delete this rental? Active passes will stop working.')) return;
      await fetch(`/api/seedbox/shares/${id}`, { method: 'DELETE' });
      await load();
    },
    [load]
  );

  const copyLink = useCallback((slug: string): void => {
    const url = `${window.location.origin}/rent/${slug}`;
    void navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-secondary">
        <LoadingSpinner /> Loading rentals…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-lg font-semibold text-text-primary">Rent out your seedbox</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Share a public link. A visitor pays{' '}
          <span className="font-medium text-text-primary">$0.25</span> for a session pass, adds
          their own magnet, your box downloads it, and they stream it — for the window you set.
        </p>
      </header>

      {ready && !ready.ready ? <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-600">
          {ready.reason ?? 'Connect a seedbox (HTTP + files) in Setup before renting it out.'}
        </div> : null}

      {error ? <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {error}
        </div> : null}

      {ready?.ready ? <section className="rounded-lg border border-border bg-bg-secondary p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">New rental</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Price (USD)</label>
              <input
                className={inputCls}
                type="number"
                min="0.25"
                step="0.05"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Session window (hours)</label>
              <input
                className={inputCls}
                type="number"
                min="1"
                value={windowHours}
                onChange={(e) => setWindowHours(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Max downloads / pass</label>
              <input
                className={inputCls}
                type="number"
                min="1"
                max="20"
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Auto-expire (days, 0 = never — recommended)</label>
              <input
                className={inputCls}
                type="number"
                min="0"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Payout wallet (optional — paid directly, minus ~1% CoinPay fee)</label>
              <input
                className={inputCls}
                placeholder="your wallet address"
                value={payoutWallet}
                onChange={(e) => setPayoutWallet(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Payout chain</label>
              <select className={inputCls} value={payoutChain} onChange={(e) => setPayoutChain(e.target.value)}>
                <option value="SOL">SOL</option>
                <option value="USDC_SOL">USDC (Solana)</option>
                <option value="POL">POL</option>
                <option value="USDC_POL">USDC (Polygon)</option>
              </select>
            </div>
          </div>
          <button
            className={cn(btn, 'mt-4 bg-accent-primary text-white hover:opacity-90')}
            onClick={() => void create()}
            disabled={creating}
          >
            {creating ? <LoadingSpinner /> : <CreditCardIcon size={16} />}
            Create rental
          </button>
          <p className="mt-2 text-xs text-text-tertiary">
            By publishing, you agree renters may download content of their choosing to your box.
            You can pause or close a rental at any time.
          </p>
        </section> : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Your rentals</h3>
        {rentals.length === 0 && (
          <p className="text-sm text-text-secondary">No rentals yet.</p>
        )}
        {rentals.map((r) => {
          const status = effectiveStatus(r);
          const lapsed = hasLapsed(r);
          return (
          <div key={r.id} className="rounded-lg border border-border bg-bg-secondary p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{r.title}</span>
                  <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>
                    {status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  ${r.priceUsd.toFixed(2)} · {Math.round(r.passWindowMinutes / 60)}h window ·{' '}
                  {r.maxDownloadsPerPass} download{r.maxDownloadsPerPass === 1 ? '' : 's'}/pass ·{' '}
                  {r.sessionCount} session{r.sessionCount === 1 ? '' : 's'} · $
                  {r.earningsUsd.toFixed(2)} earned
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {r.expiresAt
                    ? `${lapsed ? 'Auto-expired' : 'Auto-expires'} ${fmtDate(r.expiresAt)}`
                    : 'No auto-expiry'}
                  {r.expiresAt ? (
                    <button
                      className="ml-2 text-accent-primary hover:underline"
                      onClick={() => void patchRental(r.id, { expiresAt: null })}
                    >
                      remove expiry
                    </button>
                  ) : null}
                </p>
                {lapsed && r.status === 'active' ? (
                  <p className="mt-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600">
                    This link stopped taking payments when it expired. Reopen it to start
                    renting again.
                  </p>
                ) : null}
                <button
                  className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline"
                  onClick={() => copyLink(r.slug)}
                >
                  {copied === r.slug ? <CheckIcon size={14} /> : null}
                  {copied === r.slug ? 'Link copied' : `/rent/${r.slug} — copy link`}
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lapsed && r.status !== 'closed' && (
                  <button
                    className={cn(btn, 'bg-accent-primary text-white hover:opacity-90')}
                    onClick={() => void patchRental(r.id, { status: 'active', expiresAt: null })}
                  >
                    Reopen
                  </button>
                )}
                {status === 'active' && (
                  <button className={cn(btn, 'bg-bg-hover text-text-primary')} onClick={() => void patchStatus(r.id, 'paused')}>
                    Pause
                  </button>
                )}
                {r.status === 'paused' && !lapsed && (
                  <button className={cn(btn, 'bg-bg-hover text-text-primary')} onClick={() => void patchStatus(r.id, 'active')}>
                    Resume
                  </button>
                )}
                {r.status !== 'closed' && (
                  <button className={cn(btn, 'bg-bg-hover text-text-primary')} onClick={() => void patchStatus(r.id, 'closed')}>
                    Close
                  </button>
                )}
                <button
                  className={cn(btn, 'bg-red-500/10 text-red-500 hover:bg-red-500/20')}
                  onClick={() => void remove(r.id)}
                  aria-label="Delete rental"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            </div>
          </div>
          );
        })}
      </section>
    </div>
  );
}
