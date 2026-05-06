'use client';

/**
 * YouTube connected-accounts management UI.
 * Lists connected accounts, lets the user connect more, disconnect, and set default.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

function formatOauthError(error: string | null): string | null {
  if (!error) return null;
  if (error === 'missing_youtube_scope') {
    return 'Google did not grant YouTube search access. Reconnect the account and accept the YouTube permission prompt.';
  }
  return `OAuth error: ${error}`;
}

export function AccountsContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<PublicYouTubeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const oauthError = searchParams.get('error');
  const justConnected = searchParams.get('connected') === '1';
  const oauthErrorMessage = formatOauthError(oauthError);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/youtube/accounts');
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as { accounts: PublicYouTubeAccount[] };
      setAccounts(data.accounts);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDisconnect = async (id: string) => {
    setActionError(null);
    const res = await fetch(`/api/youtube/accounts?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      setActionError('Failed to disconnect');
      return;
    }
    await load();
  };

  const handleSetDefault = async (id: string) => {
    setActionError(null);
    const res = await fetch('/api/youtube/accounts/default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setActionError('Failed to set default');
      return;
    }
    await load();
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">YouTube Accounts</h1>
            <p className="text-sm text-muted-foreground">
              Connect one or more Google accounts to use YouTube inside BitTorrented.
            </p>
          </div>
          <Link
            href="/youtube"
            className="text-sm text-blue-500 hover:underline"
          >
            &larr; Back to YouTube
          </Link>
        </div>

        {justConnected ? <div className="mb-4 rounded-sm border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm text-green-400">
            Account connected.
          </div> : null}
        {oauthErrorMessage ? <div className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {oauthErrorMessage}
          </div> : null}
        {actionError ? <div className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {actionError}
          </div> : null}

        <a
          href="/api/youtube/auth/start"
          className="mb-6 inline-block rounded-sm bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
        >
          + Connect a YouTube account
        </a>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-muted-foreground">No accounts connected yet.</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-sm border border-border bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted" />
                  )}
                  <div>
                    <div className="font-medium">
                      {a.displayName ?? a.email ?? a.id}
                      {a.isDefault ? <span className="ml-2 rounded-sm bg-blue-600/20 px-2 py-0.5 text-xs text-blue-400">
                          default
                        </span> : null}
                    </div>
                    {a.email ? <div className="text-xs text-muted-foreground">{a.email}</div> : null}
                    {!a.hasSearchAccess ? <div className="text-xs text-yellow-300">
                        Reconnect required to grant YouTube search access.
                      </div> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!a.hasSearchAccess ? <a
                      href="/api/youtube/auth/start"
                      className="rounded-sm border border-yellow-500/40 px-3 py-1 text-sm text-yellow-200 hover:bg-yellow-500/10"
                    >
                      Reconnect
                    </a> : null}
                  {!a.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(a.id)}
                      className="rounded-sm border border-border px-3 py-1 text-sm hover:bg-accent"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDisconnect(a.id)}
                    className="rounded-sm border border-red-500/40 px-3 py-1 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}
