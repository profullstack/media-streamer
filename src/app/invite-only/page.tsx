'use client';

/**
 * Invite-only screen
 *
 * Where everyone who is not an admin lands while bittorrented.com is invite only
 * (src/lib/site-offline.ts). Signed out: sign up with an invite, or sign in. Signed in:
 * the site is not open yet, and here are your invites (5 a month, unused ones carry over).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface InviteView {
  code: string;
  link: string;
  createdAt: string;
  usedAt: string | null;
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

export default function InviteOnlyPage(): React.ReactElement {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/invites', { method: 'POST' });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setError(body.error ?? 'Could not create an invite');
      await load();
    } catch {
      setError('Could not create an invite');
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
      <div className="w-full max-w-lg">
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
          <div className="text-center space-y-6">
            <p className="text-text-secondary">
              New accounts need an invite from a member. If someone sent you an invite link or code, you can create
              your account now.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/signup" className={primary}>
                I have an invite
              </Link>
              <Link href="/login?redirect=%2Finvite-only" className={secondary}>
                Sign in
              </Link>
            </div>
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
                  onClick={() => void create()}
                  disabled={creating || (!state.data.unlimited && (state.data.remaining ?? 0) <= 0)}
                >
                  {creating ? 'Creating…' : 'Create invite'}
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
                        <p className="text-xs text-text-muted">
                          {invite.usedAt ? `Used ${day(invite.usedAt)}` : `Created ${day(invite.createdAt)} · unused`}
                        </p>
                      </div>
                      {invite.usedAt ? null : (
                        <button type="button" className={cn(secondary, 'py-2 text-sm')} onClick={() => void copy(invite)}>
                          {copied === invite.code ? 'Copied' : 'Copy link'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

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
