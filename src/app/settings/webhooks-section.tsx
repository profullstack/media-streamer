'use client';

/**
 * Webhooks: get a signed POST when something happens on your account (a VOD
 * pass or share pass sells, a subscription activates, a watch party starts).
 *
 * Talks to /api/v1/webhooks with the session cookie; the same API takes an
 * API token (`Authorization: Bearer btr_...`). A signing secret is shown once,
 * when an endpoint is added or its secret is rotated.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LinkIcon, LoadingSpinner, TrashIcon } from '@/components/ui/icons';

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  description: string;
  enabled: boolean;
  failures: number;
  disabled_reason: string | null;
  created_at: string;
}

interface Delivery {
  id: string;
  event_type: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  'vod.purchased': 'A pass or title in your VOD library sold',
  'share.purchased': 'A pass to your seedbox or IPTV share sold',
  'subscription.activated': 'Your subscription activated',
  'watch_party.started': 'You started a watch party',
};

const API = '/api/v1/webhooks';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export function WebhooksSection(): React.ReactElement {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; secret: string } | null>(null);
  const [log, setLog] = useState<{ id: string; deliveries: Delivery[] } | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const r = await call<{ endpoints: Endpoint[]; event_types: string[] }>('');
      return { endpoints: r.endpoints, eventTypes: r.event_types, error: null };
    } catch (e) {
      return { endpoints: [] as Endpoint[], eventTypes: [] as string[], error: e instanceof Error ? e.message : 'Could not load webhooks' };
    }
  }, []);

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchList>>) => {
    setEndpoints(r.endpoints);
    setEventTypes(r.eventTypes);
    if (r.error) setError(r.error);
  }, []);

  const load = useCallback(async () => apply(await fetchList()), [apply, fetchList]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetchList();
      if (alive) apply(r);
    })();
    return () => {
      alive = false;
    };
  }, [apply, fetchList]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const add = (e: React.FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      const r = await call<{ endpoint: Endpoint; secret: string }>('', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), events: picked.length ? picked : ['*'], description: description.trim() }),
      });
      setRevealed({ id: r.endpoint.id, secret: r.secret });
      setUrl('');
      setDescription('');
      setPicked([]);
    });
  };

  const test = (id: string): void =>
    void run(async () => {
      const r = await call<{ ok: boolean; status: number | null; error: string | null }>(`/${id}/test`, { method: 'POST' });
      setNotice(r.ok ? `Test delivered (HTTP ${r.status}).` : `Test failed: ${r.error ?? `HTTP ${r.status}`}`);
    });

  const rotate = (id: string): void => {
    if (!window.confirm('Rotate the signing secret? The old one stops working at once.')) return;
    void run(async () => {
      const r = await call<{ secret: string }>(`/${id}/rotate`, { method: 'POST' });
      setRevealed({ id, secret: r.secret });
    });
  };

  const toggle = (ep: Endpoint): void =>
    void run(async () => {
      await call(`/${ep.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !ep.enabled }) });
    });

  const remove = (id: string): void => {
    if (!window.confirm('Remove this endpoint? Its delivery log goes with it.')) return;
    void run(async () => {
      await call(`/${id}`, { method: 'DELETE' });
      if (revealed?.id === id) setRevealed(null);
    });
  };

  const showLog = (id: string): void =>
    void run(async () => {
      if (log?.id === id) {
        setLog(null);
        return;
      }
      const r = await call<{ deliveries: Delivery[] }>(`/${id}/deliveries?limit=20`);
      setLog({ id, deliveries: r.deliveries });
    });

  if (endpoints === null) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <LoadingSpinner size={16} /> Loading webhooks…
      </div>
    );
  }

  const button = 'px-3 py-1.5 rounded-lg text-sm transition-colors border border-border-subtle hover:bg-bg-tertiary';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Webhooks</h2>
        <p className="text-sm text-text-secondary">
          We POST a signed JSON event (CloudEvents, Standard Webhooks signature) to your URL when something happens on
          your account. Verify the <span className="font-mono">webhook-signature</span> header with the endpoint&apos;s
          secret. Also at <span className="font-mono">{API}</span> with an API token.
        </p>
      </div>

      {error ? <p className="text-sm text-status-error">{error}</p> : null}
      {notice ? <p className="text-sm text-text-secondary">{notice}</p> : null}

      {revealed ? (
        <div className="rounded-xl border border-accent-primary/40 bg-accent-primary/5 p-4 space-y-2">
          <p className="text-sm text-text-primary font-medium">Signing secret (shown once, copy it now)</p>
          <code className="block break-all font-mono text-sm text-accent-primary">{revealed.secret}</code>
          <div className="flex gap-2">
            <button className={button} onClick={() => void navigator.clipboard?.writeText(revealed.secret)}>
              Copy
            </button>
            <button className={button} onClick={() => setRevealed(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={add} className="rounded-xl bg-bg-secondary border border-border-subtle p-4 space-y-3">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <LinkIcon size={16} /> Add an endpoint
        </h3>
        <input
          type="url"
          required
          placeholder="https://example.com/hooks/bittorrented"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg bg-bg-primary border border-border-subtle px-3 py-2 text-sm text-text-primary"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg bg-bg-primary border border-border-subtle px-3 py-2 text-sm text-text-primary"
        />
        <fieldset className="space-y-1">
          <legend className="text-sm text-text-secondary mb-1">Events (none ticked = all)</legend>
          {eventTypes.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={picked.includes(t)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t] : p.filter((x) => x !== t)))}
              />
              <span className="font-mono">{t}</span>
              <span className="text-text-muted">{EVENT_LABELS[t] ?? ''}</span>
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-white',
            (busy || !url.trim()) && 'opacity-50 cursor-not-allowed'
          )}
        >
          Add endpoint
        </button>
      </form>

      {endpoints.length === 0 ? (
        <p className="text-sm text-text-muted">No endpoints yet.</p>
      ) : (
        <ul className="space-y-3">
          {endpoints.map((ep) => (
            <li key={ep.id} className="rounded-xl bg-bg-secondary border border-border-subtle p-4 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-text-primary break-all">{ep.url}</p>
                  {ep.description ? <p className="text-sm text-text-secondary">{ep.description}</p> : null}
                  <p className="text-xs text-text-muted mt-1">
                    {ep.events.join(', ')} · {ep.enabled ? 'on' : 'off'}
                    {ep.failures > 0 ? ` · ${ep.failures} failures in a row` : ''}
                    {ep.disabled_reason ? ` · ${ep.disabled_reason}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => remove(ep.id)}
                  disabled={busy}
                  aria-label="Remove endpoint"
                  className="p-2 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error/10"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={button} disabled={busy} onClick={() => test(ep.id)}>
                  Send test
                </button>
                <button className={button} disabled={busy} onClick={() => toggle(ep)}>
                  {ep.enabled ? 'Turn off' : 'Turn on'}
                </button>
                <button className={button} disabled={busy} onClick={() => rotate(ep.id)}>
                  Rotate secret
                </button>
                <button className={button} disabled={busy} onClick={() => showLog(ep.id)}>
                  {log?.id === ep.id ? 'Hide deliveries' : 'Deliveries'}
                </button>
              </div>
              {log?.id === ep.id ? (
                log.deliveries.length === 0 ? (
                  <p className="text-xs text-text-muted">Nothing sent yet.</p>
                ) : (
                  <ul className="text-xs font-mono text-text-secondary space-y-1">
                    {log.deliveries.map((d) => (
                      <li key={d.id}>
                        {new Date(d.created_at).toLocaleString()} {d.event_type} {d.status}
                        {d.last_status ? ` HTTP ${d.last_status}` : ''}
                        {d.last_error ? ` (${d.last_error})` : ''} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
