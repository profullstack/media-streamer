'use client';

/**
 * Invite-only screen
 *
 * Where everyone who is not an admin lands while bittorrented.com is invite only
 * (src/lib/site-offline.ts). Signed out: what BitTorrented is (InviteLanding), then sign up
 * with an invite, or sign in. Signed in:
 * the site is not open yet, and here are your invites (5 a month, unused ones carry over).
 *
 * "Create invite" opens a <dialog> for the invite's limits: an expiry date and/or a
 * number of uses, or neither, in which case it works forever. Each allowed use costs
 * one of the allowance; only admins may leave the uses open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { InviteLanding } from '@/components/home/invite-landing';

interface InviteView {
  code: string;
  link: string;
  createdAt: string;
  usedAt: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  open: boolean;
}

interface InvitesResponse {
  remaining: number | null;
  unlimited: boolean;
  monthly: number;
  invites: InviteView[];
}

type State = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'member'; data: InvitesResponse } | { kind: 'error' };

const button = cn(
  'inline-flex items-center justify-center rounded-lg px-4 py-3 font-medium transition-colors',
  'disabled:opacity-50 disabled:cursor-not-allowed'
);
const primary = cn(button, 'bg-accent-primary text-white hover:bg-accent-primary/90');
const secondary = cn(button, 'border border-border-default bg-bg-tertiary text-text-primary hover:border-accent-primary');

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** yyyy-mm-dd in local time, `days` from today: the value an <input type="date"> takes. */
function dateInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** An expiry date means "through the end of that day", in the creator's time zone. */
function endOfDay(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** One line on what an invite allows and where it stands. */
function inviteStatus(invite: InviteView): string {
  const uses =
    invite.maxUses === null
      ? `${invite.useCount} used, no limit`
      : invite.maxUses === 1
        ? invite.useCount
          ? 'used'
          : 'single use'
        : `${invite.useCount} of ${invite.maxUses} used`;
  const expired = invite.expiresAt !== null && Date.parse(invite.expiresAt) <= Date.now();
  const when = invite.expiresAt
    ? `${expired ? 'expired' : 'expires'} ${day(invite.expiresAt)}`
    : invite.maxUses === null
      ? 'works forever'
      : 'no expiry';
  const last = invite.usedAt ? ` · last used ${day(invite.usedAt)}` : '';
  return `Created ${day(invite.createdAt)} · ${uses} · ${when}${last}`;
}

const field = cn(
  'w-full rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-text-primary',
  'focus:border-accent-primary focus:outline-none disabled:opacity-40'
);

export default function InviteOnlyPage(): React.ReactElement {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [limitUses, setLimitUses] = useState(true);
  const [uses, setUses] = useState('1');
  const [expires, setExpires] = useState(false);
  const [expiry, setExpiry] = useState(dateInput(7));
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/invites', { cache: 'no-store' });
      if (res.status === 401) return setState({ kind: 'signed-out' });
      if (!res.ok) return setState({ kind: 'error' });
      setState({ kind: 'member', data: (await res.json()) as InvitesResponse });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDialog = (unlimited: boolean) => {
    // Admins start at "works forever"; members can only make limited invites.
    setLimitUses(!unlimited);
    setUses('1');
    setExpires(false);
    setExpiry(dateInput(7));
    setFormError(null);
    dialog.current?.showModal();
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setFormError(null);
    setError(null);
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          maxUses: limitUses ? Number(uses) : null,
          expiresAt: expires ? endOfDay(expiry) : null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormError(body.error ?? 'Could not create an invite');
        return;
      }
      dialog.current?.close();
      await load();
    } catch {
      setFormError('Could not create an invite');
    } finally {
      setCreating(false);
    }
  };

  const copy = async (invite: InviteView) => {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(invite.code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(`Copy failed. The link is ${invite.link}`);
    }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setState({ kind: 'signed-out' });
  };

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary flex items-start sm:items-center justify-center px-4 py-12">
      <div className={cn('w-full', state.kind === 'signed-out' ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="mb-8 text-center">
          <Image src="/logo.svg" alt="BitTorrented" width={256} height={64} className="w-56 h-auto mx-auto" priority />
        </div>

        <h1 className="text-2xl font-bold text-center mb-3">BitTorrented is invite only</h1>

        {state.kind === 'loading' ? <p className="text-center text-text-secondary">Loading…</p> : null}

        {state.kind === 'error' ? (
          <p className="text-center text-text-secondary">
            Something went wrong. <button className="text-accent-primary" onClick={() => void load()}>Try again</button>
          </p>
        ) : null}

        {state.kind === 'signed-out' ? (
          <div className="space-y-6">
            <p className="text-center text-text-secondary">
              New accounts need an invite from a member. If someone sent you an invite link or code, you can create
              your account now.
            </p>
            <InviteLanding className="pt-4" />
          </div>
        ) : null}

        {state.kind === 'member' ? (
          <div className="space-y-6">
            <p className="text-center text-text-secondary">
              You&apos;re in. The site isn&apos;t open yet; your account is kept and you&apos;ll hear from us when it
              is. Meanwhile you can invite people.
            </p>

            <section className="rounded-lg border border-border-default bg-bg-secondary p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Your invites</h2>
                  <p className="text-sm text-text-secondary">
                    {state.data.unlimited
                      ? 'Admin: no limit.'
                      : `${state.data.remaining ?? 0} available. You get ${state.data.monthly} a month, and unused ones carry over.`}
                  </p>
                </div>
                <button
                  type="button"
                  className={primary}
                  onClick={() => openDialog(state.data.unlimited)}
                  disabled={!state.data.unlimited && (state.data.remaining ?? 0) <= 0}
                >
                  Create invite
                </button>
              </div>

              {error ? (
                <p className="mb-4 rounded-lg bg-status-error/10 border border-status-error/20 p-3 text-sm text-status-error">
                  {error}
                </p>
              ) : null}

              {state.data.invites.length === 0 ? (
                <p className="text-sm text-text-muted">No invites yet.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {state.data.invites.map((invite) => (
                    <li key={invite.code} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <code className="font-mono text-base">{invite.code}</code>
                        <p className="text-xs text-text-muted">{inviteStatus(invite)}</p>
                      </div>
                      {!invite.open ? null : (
                        <button type="button" className={cn(secondary, 'py-2 text-sm')} onClick={() => void copy(invite)}>
                          {copied === invite.code ? 'Copied' : 'Copy link'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <InviteDialog
              ref={dialog}
              unlimited={state.data.unlimited}
              remaining={state.data.remaining ?? 0}
              limitUses={limitUses}
              setLimitUses={setLimitUses}
              uses={uses}
              setUses={setUses}
              expires={expires}
              setExpires={setExpires}
              expiry={expiry}
              setExpiry={setExpiry}
              error={formError}
              creating={creating}
              onSubmit={create}
            />

            <p className="text-center text-sm">
              <button type="button" className="text-text-secondary hover:text-text-primary" onClick={() => void signOut()}>
                Sign out
              </button>
            </p>
          </div>
        ) : null}

        <p className="mt-10 text-center text-xs text-text-muted">
          Questions: <a href="mailto:support@profullstack.com" className="underline">support@profullstack.com</a>
        </p>
      </div>
    </main>
  );
}

interface InviteDialogProps {
  ref: React.Ref<HTMLDialogElement>;
  unlimited: boolean;
  remaining: number;
  limitUses: boolean;
  setLimitUses: (v: boolean) => void;
  uses: string;
  setUses: (v: string) => void;
  expires: boolean;
  setExpires: (v: boolean) => void;
  expiry: string;
  setExpiry: (v: string) => void;
  error: string | null;
  creating: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

/** The create form. A native <dialog>: Esc and the backdrop close it, focus is trapped. */
function InviteDialog({ ref, ...props }: InviteDialogProps): React.ReactElement {
  const { unlimited, remaining, limitUses, uses, expires, expiry } = props;
  const maxUses = unlimited ? 1000 : Math.max(1, remaining);
  const n = Number(uses);
  const summary =
    !limitUses && !expires
      ? 'Works forever, for any number of people.'
      : `${limitUses ? `Up to ${n || '…'} ${n === 1 ? 'person' : 'people'}` : 'Any number of people'}, ${
          expires && expiry ? `until the end of ${day(`${expiry}T12:00:00`)}` : 'with no expiry'
        }.`;
  const close = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  };

  return (
    <dialog
      ref={ref}
      onClick={close}
      aria-labelledby="invite-dialog-title"
      className={cn(
        'm-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border-default bg-bg-secondary p-0 text-text-primary',
        'backdrop:bg-black/60'
      )}
    >
      <form onSubmit={props.onSubmit} className="space-y-5 p-6">
        <div>
          <h2 id="invite-dialog-title" className="text-lg font-semibold">
            New invite
          </h2>
          <p className="text-sm text-text-secondary">Set a limit, both, or neither.</p>
        </div>

        <fieldset className="space-y-2">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={limitUses}
              disabled={!unlimited}
              onChange={(e) => props.setLimitUses(e.target.checked)}
            />
            Limit the number of uses
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={maxUses}
            step={1}
            required={limitUses}
            disabled={!limitUses}
            value={uses}
            onChange={(e) => props.setUses(e.target.value)}
            aria-label="Number of uses"
            className={field}
          />
          <p className="text-xs text-text-muted">
            {unlimited
              ? 'Admin: invites cost nothing, and you may leave the uses open.'
              : `Each use costs one invite. You have ${remaining}.`}
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={expires} onChange={(e) => props.setExpires(e.target.checked)} />
            Expires
          </label>
          <input
            type="date"
            min={dateInput(0)}
            required={expires}
            disabled={!expires}
            value={expiry}
            onChange={(e) => props.setExpiry(e.target.value)}
            aria-label="Expiry date"
            className={field}
          />
          <div className="flex gap-2">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                type="button"
                className={cn(secondary, 'px-3 py-1 text-xs')}
                onClick={() => {
                  props.setExpires(true);
                  props.setExpiry(dateInput(d));
                }}
              >
                {d === 1 ? 'Tomorrow' : `${d} days`}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="rounded-lg bg-bg-tertiary p-3 text-sm">{summary}</p>

        {props.error ? (
          <p className="rounded-lg bg-status-error/10 border border-status-error/20 p-3 text-sm text-status-error">
            {props.error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className={secondary}
            onClick={(e) => (e.currentTarget.closest('dialog') as HTMLDialogElement | null)?.close()}
          >
            Cancel
          </button>
          <button type="submit" className={primary} disabled={props.creating}>
            {props.creating ? 'Creating…' : 'Create invite'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
