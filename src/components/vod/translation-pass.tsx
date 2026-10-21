'use client';

/**
 * Free sessions and prepaid passes for translated audio, the nixamp.com offer
 * (src/lib/translate/passes.ts): 10 free sessions a day, then a Day or Month
 * pass paid through CoinPay. Returning from checkout (?translation_order=)
 * asks the server, which asks CoinPay, so credit appears without the webhook.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranslationAccess } from '@profullstack/live-translate';

const money = (micros: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(micros / 1_000_000);

/** Minutes a pass buys at about 1,000 spoken characters a minute (nixamp's estimate). */
const minutesFor = (priceCents: number): number => Math.floor(priceCents / 100 / ((0.22 * 3 / 60 + 0.05) * 5));

export interface TranslationPass {
  access: TranslationAccess | null;
  /** Free time today, a live free session, or unexpired credit. */
  ready: boolean;
  summary: string;
  startSession: (resource: string) => Promise<void>;
  refresh: () => Promise<void>;
}

function isReady(access: TranslationAccess): boolean {
  const now = Date.now();
  return access.free.remaining > 0 ||
    Boolean(access.free.activeUntil && Date.parse(access.free.activeUntil) > now) ||
    Boolean(access.balanceMicros > 0 && access.expires && Date.parse(access.expires) > now);
}

export function useTranslationPass(): TranslationPass {
  const [state, setState] = useState<{ access: TranslationAccess; ready: boolean } | null>(null);
  const access = state?.access ?? null;
  const setAccess = useCallback((next: TranslationAccess): void => setState({ access: next, ready: isReady(next) }), []);

  const refresh = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/translate/passes', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setAccess((await res.json()) as TranslationAccess);
  }, [setAccess]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once from the server
    void refresh();
  }, [refresh]);

  const startSession = useCallback(async (resource: string): Promise<void> => {
    const res = await fetch('/api/translate/passes/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resource }),
    });
    const body = (await res.json()) as TranslationAccess & { error?: string };
    if (!res.ok) throw new Error(body.error || 'This free session could not be started.');
    setAccess(body);
  }, [setAccess]);

  const ready = state?.ready ?? false;
  const summary = access
    ? [
        `${access.free.remaining} of ${access.free.limit} free sessions left today${access.free.activeUntil ? ' · free session active' : ''}`,
        access.balanceMicros > 0 && access.expires
          ? `Audio credit ${money(access.balanceMicros)} until ${new Date(access.expires).toLocaleString()}`
          : '',
      ].filter(Boolean).join(' · ')
    : '';

  return { access, ready, summary, startSession, refresh };
}

export function TranslationPassBuy({ pass }: { pass: TranslationPass }): React.ReactElement | null {
  const { access, refresh } = pass;
  const [plan, setPlan] = useState('day');
  const [order, setOrder] = useState<{ id: string; url: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<{ key: string; for: string } | null>(null);

  const check = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/translate/passes/orders/${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
    const body = res ? ((await res.json()) as { status?: string; error?: string }) : { error: 'Payment status could not be checked.' };
    if (!res?.ok) {
      setNote(body.error || 'Payment status could not be checked.');
      return;
    }
    if (body.status === 'paid') {
      setOrder(null);
      requestKey.current = null;
      setNote('Payment confirmed. Press Translate whenever you are ready.');
      const url = new URL(window.location.href);
      url.searchParams.delete('translation_order');
      window.history.replaceState(window.history.state, '', url);
      await refresh();
      return;
    }
    setNote(body.status === 'pending' ? 'Waiting for payment confirmation…' : `Payment ${body.status}. Check again if you already sent it.`);
  }, [refresh]);

  // While a purchase is open, ask every 5 s; a paid order clears it and stops this.
  useEffect(() => {
    if (!order) return;
    const timer = setInterval(() => void check(order.id), 5000);
    return () => clearInterval(timer);
  }, [order, check]);

  // Back from CoinPay, or a purchase still pending from earlier.
  useEffect(() => {
    if (!access || order) return;
    const returned = new URLSearchParams(window.location.search).get('translation_order');
    const pending = access.orders.find((o) => o.id === returned) ?? access.orders[0];
    if (pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resumes a purchase the server reports
      setOrder({ id: pending.id, url: pending.url });
      void check(pending.id);
    } else if (returned && /^[a-f0-9-]{36}$/i.test(returned)) {
      void check(returned);
    }
  }, [access, order, check]);

  if (!access) return null;
  const chosen = access.plans.find((p) => p.id === plan) ?? access.plans[0];

  const buy = async (): Promise<void> => {
    if (!chosen) return;
    const selected = chosen.id;
    if (requestKey.current?.for !== selected) requestKey.current = { key: crypto.randomUUID(), for: selected };
    setBusy(true);
    setNote('Preparing secure checkout…');
    try {
      const res = await fetch('/api/translate/passes/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: chosen.id, requestKey: requestKey.current.key, returnTo: window.location.pathname }),
      });
      const body = (await res.json()) as { id?: string; url?: string; error?: string };
      if (!res.ok || !body.id || !body.url) throw new Error(body.error || 'Checkout could not be opened.');
      setOrder({ id: body.id, url: body.url });
      window.open(body.url, '_blank', 'noopener');
      setNote('Pay in the CoinPay tab with any coin or PayPal; your video keeps playing here. Credit appears after confirmation.');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Checkout could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-2">
      <p className="text-text-secondary">
        Each account gets {access.free.limit} free sessions a day (resets midnight UTC). After that, buy a pass:
        credit is spent as you listen and never renews automatically.
      </p>
      {access.available && chosen ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Pass"
            className="rounded-md border border-border bg-background px-2 py-1 text-text-primary"
            value={chosen.id}
            onChange={(e) => setPlan(e.target.value)}
          >
            {access.plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {money(p.priceCents * 10_000)}</option>
            ))}
          </select>
          <button
            className="rounded-md bg-accent-primary px-3 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            onClick={() => void buy()}
            disabled={busy}
          >
            Buy pass
          </button>
          {order ? (
            <>
              <a className="text-accent-primary hover:underline" href={order.url} target="_blank" rel="noopener noreferrer">Open checkout</a>
              <button className="text-text-secondary hover:text-text-primary" onClick={() => void check(order.id)}>Check payment</button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-text-tertiary">Checkout is temporarily unavailable. Free sessions and existing credit still work.</p>
      )}
      {chosen ? (
        <p className="text-text-tertiary">
          {money(chosen.priceCents * 10_000)} credit, expires {chosen.days === 1 ? '24 hours' : `${chosen.days} days`} after
          payment. About {minutesFor(chosen.priceCents)} minutes of translated audio; usage varies.
        </p>
      ) : null}
      {note ? <p className="text-text-secondary">{note}</p> : null}
    </div>
  );
}
