'use client';

/**
 * BrokerConnect — connect/disconnect a read-only brokerage (PRD §3.4).
 *
 * v1 supports Alpaca. The user pastes their API key/secret (read-only); we send
 * them once over HTTPS to the server, which verifies + stores them encrypted.
 * Secrets are never read back. Disconnect purges synced holdings.
 */

import { useCallback, useEffect, useState } from 'react';

interface Connection {
  id: string;
  provider: string;
  status: 'active' | 'error' | 'revoked';
  label: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export function BrokerConnect(): React.ReactElement {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [paper, setPaper] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/finance/broker/connect', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { connections: [] }))
      .then((body: { connections?: Connection[] }) => setConnections(body.connections ?? []))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/finance/broker/connect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'alpaca', apiKey, apiSecret, paper, label: paper ? 'Paper' : 'Live' }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? 'Could not connect.');
          return;
        }
        setApiKey('');
        setApiSecret('');
        setShowForm(false);
        load();
      } catch {
        setError('Network error.');
      } finally {
        setBusy(false);
      }
    },
    [apiKey, apiSecret, paper, load],
  );

  const disconnect = useCallback(
    async (id: string) => {
      await fetch(`/api/finance/broker/connect?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      load();
    },
    [load],
  );

  if (!loaded) return <></>;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
        Connected accounts
      </h2>

      {connections.length > 0 && (
        <ul className="mb-3 space-y-2">
          {connections.map((c) => (
            <li key={c.id} className="card flex items-center justify-between p-3 text-sm">
              <div>
                <span className="font-medium capitalize text-text-primary">{c.provider}</span>
                {c.label ? <span className="ml-2 text-text-muted">{c.label}</span> : null}
                <span
                  className={`ml-2 text-xs ${c.status === 'active' ? 'text-green-400' : 'text-red-400'}`}
                >
                  {c.status}
                </span>
                {c.lastSyncAt ? <span className="ml-2 text-xs text-text-muted">
                    synced {new Date(c.lastSyncAt).toLocaleString()}
                  </span> : null}
              </div>
              <button type="button" onClick={() => disconnect(c.id)} className="text-xs text-red-400 hover:underline">
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form onSubmit={connect} className="card space-y-3 p-4">
          <p className="text-xs text-text-muted">
            Connect Alpaca read-only. Create API keys in the Alpaca dashboard; we request positions and
            balances only — never trade or withdrawal access.
          </p>
          <input
            className="input"
            placeholder="Alpaca API Key ID"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <input
            className="input"
            type="password"
            placeholder="Alpaca API Secret"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            autoComplete="off"
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} />
            Paper trading account
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !apiKey || !apiSecret} className="btn btn-primary text-sm disabled:opacity-60">
              {busy ? 'Connecting…' : 'Connect'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="btn btn-secondary text-sm">
          + Connect Alpaca (read-only)
        </button>
      )}
    </section>
  );
}
