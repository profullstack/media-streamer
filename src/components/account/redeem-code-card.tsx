'use client';

/**
 * "Have a code?": redeem a credit code for days of Premium (POST /api/account/redeem).
 * Shown on /account (Subscription) and /settings. Also links to /invites.
 */

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface RedeemCodeCardProps {
  /** Called after a successful redemption, e.g. to reload the plan shown above. */
  onRedeemed?: () => void;
  className?: string;
}

type Outcome = { kind: 'ok'; text: string } | { kind: 'error'; text: string } | null;

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function RedeemCodeCard({ onRedeemed, className }: RedeemCodeCardProps): React.ReactElement {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch('/api/account/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        days?: number;
        expiresAt?: string | null;
      };
      if (!res.ok || !body.ok) {
        setOutcome({ kind: 'error', text: body.error ?? 'That code is not valid.' });
        return;
      }
      const days = body.days ?? 0;
      setOutcome({
        kind: 'ok',
        text: `Redeemed: ${days} ${days === 1 ? 'day' : 'days'} of Premium${body.expiresAt ? `, now through ${day(body.expiresAt)}` : ''}.`,
      });
      setCode('');
      onRedeemed?.();
    } catch {
      setOutcome({ kind: 'error', text: 'Could not reach BitTorrented. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="redeem-code-title"
      className={cn('rounded-lg border border-border-default bg-bg-secondary p-5', className)}
    >
      <h3 id="redeem-code-title" className="text-sm font-medium text-text-primary">
        Have a code?
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        A code from us adds days of Premium to your account, on top of anything you already have.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="redeem-code" className="sr-only">
          Code
        </label>
        <input
          id="redeem-code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="BT-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          className={cn(
            'min-w-0 flex-1 basis-56 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 font-mono text-text-primary',
            'focus:border-accent-primary focus:outline-none'
          )}
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className={cn(
            'rounded-lg bg-accent-primary px-4 py-2 font-medium text-white transition-colors hover:bg-accent-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {busy ? 'Redeeming…' : 'Redeem'}
        </button>
      </form>
      {outcome ? (
        <p
          role="status"
          className={cn('mt-3 text-sm', outcome.kind === 'ok' ? 'text-status-success' : 'text-status-error')}
        >
          {outcome.text}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-text-muted">
        No code? <Link href="/invites" className="text-accent-primary hover:underline">Invite a friend</Link> and you
        both get Premium days.
      </p>
    </section>
  );
}
