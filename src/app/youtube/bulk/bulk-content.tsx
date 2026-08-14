'use client';

/**
 * Bulk YouTube subscribe/unsubscribe UI.
 *
 * The list URL is fetched in the browser, not on the server, so the app never
 * acts as an open fetch proxy. Every run is previewed first: the preview shows
 * exactly how many writes are needed and what they cost against the YouTube
 * Data API's 10,000 unit/day allowance (50 units per subscribe or unsubscribe).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';

const SMALLWEB_LIST_URL =
  'https://raw.githubusercontent.com/kagisearch/smallweb/refs/heads/main/smallyt.txt';

interface PublicYouTubeAccount {
  id: string;
  email: string | null;
  displayName: string | null;
  isDefault: boolean;
  hasSubscriptionManageAccess: boolean;
}

interface BulkPlanItem {
  channelId: string;
  title: string | null;
}

interface BulkItemResult {
  channelId: string;
  title: string | null;
  status: 'ok' | 'failed';
  error?: string;
}

interface BulkResponse {
  dryRun: boolean;
  action: 'subscribe' | 'unsubscribe';
  totalRequested: number;
  pendingCount: number;
  skippedCount: number;
  pending: BulkPlanItem[];
  unresolved: string[];
  estimatedQuotaUnits: number;
  withinDailyQuota: boolean;
  dailyWriteCapacity: number;
  dailyQuota: number;
  succeeded?: BulkItemResult[];
  failed?: BulkItemResult[];
  remaining?: BulkPlanItem[];
  succeededCount?: number;
  failedCount?: number;
  remainingCount?: number;
  quotaUnitsSpent?: number;
  quotaExceeded?: boolean;
}

type Action = 'subscribe' | 'unsubscribe';

export function BulkContent(): React.ReactElement {
  const [accounts, setAccounts] = useState<PublicYouTubeAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [listUrl, setListUrl] = useState(SMALLWEB_LIST_URL);
  const [listText, setListText] = useState('');
  const [action, setAction] = useState<Action>('subscribe');
  const [maxWrites, setMaxWrites] = useState('200');
  const [plan, setPlan] = useState<BulkResponse | null>(null);
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [busy, setBusy] = useState<'idle' | 'fetching' | 'planning' | 'applying'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/youtube/accounts');
        if (!res.ok) throw new Error(`Failed to load accounts: ${res.status}`);
        const data = (await res.json()) as { accounts: PublicYouTubeAccount[] };
        setAccounts(data.accounts);
        const preferred = data.accounts.find((a) => a.isDefault) ?? data.accounts[0];
        setActiveAccountId(preferred?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts');
      }
    })();
  }, []);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const lineCount = useMemo(
    () => listText.split('\n').filter((line) => line.trim().length > 0).length,
    [listText]
  );

  const loadListFromUrl = useCallback(async () => {
    setBusy('fetching');
    setError(null);
    setPlan(null);
    setResult(null);
    try {
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error(`Could not fetch list: ${res.status}`);
      setListText(await res.text());
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — if the site blocks cross-origin reads, paste the list below instead.`
          : 'Could not fetch list'
      );
    } finally {
      setBusy('idle');
    }
  }, [listUrl]);

  const run = useCallback(
    async (dryRun: boolean) => {
      if (!listText.trim()) {
        setError('Load or paste a channel list first.');
        return;
      }
      setBusy(dryRun ? 'planning' : 'applying');
      setError(null);
      if (dryRun) setResult(null);

      try {
        const res = await fetch('/api/youtube/subscriptions/bulk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId: activeAccountId ?? undefined,
            action,
            text: listText,
            dryRun,
            maxWrites: dryRun ? undefined : Number(maxWrites) || undefined,
          }),
        });

        const body = (await res.json()) as BulkResponse & { error?: string; message?: string };
        if (!res.ok) {
          throw new Error(body.message ?? body.error ?? `Failed: ${res.status}`);
        }

        if (dryRun) setPlan(body);
        else {
          setResult(body);
          setPlan(body);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bulk update failed');
      } finally {
        setBusy('idle');
      }
    },
    [action, activeAccountId, listText, maxWrites]
  );

  const noManageAccess = activeAccount !== null && !activeAccount.hasSubscriptionManageAccess;
  const verb = action === 'subscribe' ? 'Subscribe' : 'Unsubscribe';

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bulk Subscriptions</h1>
            <p className="text-sm text-muted-foreground">
              Subscribe or unsubscribe from a whole list of YouTube channels at once.
            </p>
          </div>
          <Link href="/youtube" className="text-sm text-blue-400 hover:underline">
            Back to YouTube
          </Link>
        </div>

        {error ? (
          <div className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        ) : null}

        {accounts.length === 0 ? (
          <div className="mb-4 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
            No YouTube account connected.{' '}
            <Link href="/youtube/accounts" className="text-blue-400 hover:underline">
              Connect one first
            </Link>
            .
          </div>
        ) : null}

        {noManageAccess ? (
          <div className="mb-4 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
            This account cannot manage subscriptions.{' '}
            <Link href="/youtube/accounts" className="text-blue-400 hover:underline">
              Reconnect it from Manage accounts
            </Link>
            .
          </div>
        ) : null}

        {accounts.length > 1 ? (
          <label className="mb-4 block text-sm">
            <span className="mb-1 block text-muted-foreground">Account</span>
            <select
              value={activeAccountId ?? ''}
              onChange={(e) => setActiveAccountId(e.target.value)}
              className="w-full rounded-sm border border-border bg-background px-3 py-2"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email ?? a.displayName ?? a.id}
                  {a.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="mb-2 block text-sm">
          <span className="mb-1 block text-muted-foreground">List URL</span>
          <div className="flex gap-2">
            <input
              type="url"
              value={listUrl}
              onChange={(e) => setListUrl(e.target.value)}
              className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm"
              placeholder="https://…/smallyt.txt"
            />
            <button
              type="button"
              onClick={() => void loadListFromUrl()}
              disabled={busy !== 'idle'}
              className="rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === 'fetching' ? 'Loading…' : 'Load'}
            </button>
          </div>
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-muted-foreground">
            Channel list {lineCount > 0 ? `(${lineCount} lines)` : '(or paste below)'}
          </span>
          <textarea
            value={listText}
            onChange={(e) => {
              setListText(e.target.value);
              setPlan(null);
              setResult(null);
            }}
            rows={8}
            spellCheck={false}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs"
            placeholder={'UCxxxxxxxxxxxxxxxxxxxxxx\nhttps://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx\n…or a smallweb-style list'}
          />
        </label>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Action</span>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value as Action);
                setPlan(null);
                setResult(null);
              }}
              className="rounded-sm border border-border bg-background px-3 py-2"
            >
              <option value="subscribe">Subscribe to all</option>
              <option value="unsubscribe">Unsubscribe from all</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Max writes this run</span>
            <input
              type="number"
              min={1}
              value={maxWrites}
              onChange={(e) => setMaxWrites(e.target.value)}
              className="w-32 rounded-sm border border-border bg-background px-3 py-2"
            />
          </label>

          <button
            type="button"
            onClick={() => void run(true)}
            disabled={busy !== 'idle' || !listText.trim() || noManageAccess}
            className="rounded-sm border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy === 'planning' ? 'Checking…' : 'Preview'}
          </button>

          <button
            type="button"
            onClick={() => void run(false)}
            disabled={busy !== 'idle' || !plan || plan.pendingCount === 0 || noManageAccess}
            className={`rounded-sm px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              action === 'unsubscribe' ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {busy === 'applying' ? 'Applying…' : `${verb} ${plan?.pendingCount ?? 0}`}
          </button>
        </div>

        {plan ? (
          <div className="mb-4 rounded-sm border border-border bg-muted/30 px-4 py-3 text-sm">
            <div className="mb-1 font-medium">
              {plan.totalRequested} channels in list — {plan.pendingCount} need a {plan.action}
            </div>
            <div className="text-muted-foreground">
              {plan.skippedCount} already {plan.action === 'subscribe' ? 'subscribed' : 'not subscribed'}
              {plan.unresolved.length > 0 ? ` · ${plan.unresolved.length} lines had no channel id` : ''}
            </div>
            <div className="mt-1 text-muted-foreground">
              Estimated quota: {plan.estimatedQuotaUnits.toLocaleString()} of{' '}
              {plan.dailyQuota.toLocaleString()} units/day
            </div>
            {!plan.withinDailyQuota ? (
              <div className="mt-2 text-yellow-300">
                ⚠ This exceeds one day of API quota. Apply up to {plan.dailyWriteCapacity} today, then
                run it again tomorrow — already-done channels are skipped automatically.
              </div>
            ) : null}
          </div>
        ) : null}

        {result && !result.dryRun ? (
          <div className="rounded-sm border border-border bg-muted/30 px-4 py-3 text-sm">
            <div className="mb-1 font-medium">
              {result.succeededCount} succeeded · {result.failedCount} failed ·{' '}
              {result.remainingCount} not attempted
            </div>
            {result.quotaExceeded ? (
              <div className="mt-1 text-yellow-300">
                ⚠ Stopped early — the YouTube daily quota is exhausted. It resets at midnight Pacific;
                re-run then to continue.
              </div>
            ) : null}
            {result.failed && result.failed.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-red-400">
                {result.failed.slice(0, 10).map((f) => (
                  <li key={f.channelId}>
                    {f.title ?? f.channelId}: {f.error}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
}
