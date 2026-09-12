'use client';

/**
 * Connected accounts — other places that act on your behalf, or you on theirs.
 *
 * Today that is nixamp: bittorrented.com is an OAuth 2.1 client of nixamp.com,
 * so connecting one lets a watch party here become a room there, joinable from
 * every nixamp surface.
 *
 * The name shown is the nixamp HANDLE, never the address. On nixamp the
 * account email is the OAuth linking key and is treated as a credential; the
 * handle is the name that is safe to show.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CheckIcon, LinkIcon, LoadingSpinner, TrashIcon } from '@/components/ui/icons';

interface Connection {
  handle: string;
  site: string;
  scopes: string[];
}

interface ConnectionResponse {
  configured?: boolean;
  connected?: boolean;
  connection?: Connection;
  error?: string;
}

/** The words the callback puts in the URL, in words a person would use. */
const REASONS: Record<string, string> = {
  access_denied: 'You said not now on nixamp. Nothing was connected.',
  state_mismatch: 'That sign-in link had expired. Try connecting again.',
  not_authenticated: 'You were signed out partway through. Sign in and try again.',
  server_misconfigured: 'This server has no nixamp settings yet.',
  exchange_failed: 'nixamp would not finish the connection. Try again.',
  missing_code_or_state: 'nixamp sent an incomplete answer. Try again.',
};

export function ConnectionsSection(): React.ReactElement {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ConnectionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<ConnectionResponse> => {
    try {
      const res = await fetch('/api/v1/nixamp/connection');
      const body = (await res.json()) as ConnectionResponse;
      return res.ok ? body : { connected: false, configured: false };
    } catch {
      return { connected: false, configured: false };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const answer = await load();
      if (alive) setState(answer);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/nixamp/connection', { method: 'DELETE' });
      if (!res.ok) setError('Could not disconnect. Try again.');
      setState(await load());
    } finally {
      setBusy(false);
    }
  }, [load]);

  const justConnected = searchParams.get('nixamp') === 'connected';
  const refusal = searchParams.get('nixamp_error');

  if (state === null) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <LoadingSpinner size={16} /> Checking your connections…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Connected accounts</h2>
        <p className="text-sm text-text-secondary">
          Other places that can act for you here, or that you can act on from here.
        </p>
      </div>

      {justConnected ? (
        <p className="flex items-center gap-2 text-sm text-green-500">
          <CheckIcon size={16} /> nixamp is connected.
        </p>
      ) : null}
      {refusal ? (
        <p className="text-sm text-status-error">{REASONS[refusal] ?? `nixamp said: ${refusal}`}</p>
      ) : null}

      <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <LinkIcon size={16} /> nixamp
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              {state.connected
                ? 'A watch party here can be a room on nixamp, joinable from the nixamp app, a terminal, the desktop app or a TV.'
                : 'Connect nixamp and a watch party here becomes a room people can join from any nixamp client.'}
            </p>
            {state.connected && state.connection ? (
              <p className="text-sm text-text-muted mt-2">
                Connected as{' '}
                <span className="font-mono text-accent-primary">@{state.connection.handle}</span> on{' '}
                {state.connection.site.replace(/^https?:\/\//, '')}
                {state.connection.scopes.length > 0 ? ` · ${state.connection.scopes.join(', ')}` : ''}
              </p>
            ) : null}
          </div>

          {state.connected ? (
            <button
              onClick={() => void disconnect()}
              disabled={busy}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                'text-text-muted hover:text-status-error hover:bg-status-error/10',
                busy && 'opacity-50 cursor-not-allowed'
              )}
            >
              <TrashIcon size={16} /> Disconnect
            </button>
          ) : (
            // A link and not a fetch: connecting is a round trip through
            // nixamp's own consent page, which is the only place the decision
            // can honestly be made.
            <a
              href="/api/v1/nixamp/oauth/start"
              className={cn(
                'px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors',
                state.configured
                  ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
                  : 'bg-bg-tertiary text-text-muted pointer-events-none'
              )}
            >
              {state.configured ? 'Connect nixamp' : 'Not configured'}
            </a>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-status-error">{error}</p> : null}
    </div>
  );
}
