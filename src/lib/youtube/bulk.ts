/**
 * Bulk subscribe / unsubscribe against a list of YouTube channel ids.
 *
 * The YouTube Data API charges 50 quota units for every `subscriptions.insert`
 * and `subscriptions.delete`, against a default allowance of 10,000 units per
 * project per day. That is ~200 writes/day for the whole app, so bulk runs are
 * planned before they are executed, stop the moment the quota is exhausted, and
 * always report exactly what is left to do so the run can be resumed tomorrow.
 */

import { listSubscribedChannels, unsubscribeFromChannel } from './service';
import { ytFetch } from './client';
import type { YouTubeAccount } from './types';

/** Quota cost of a single subscriptions.insert or subscriptions.delete. */
export const SUBSCRIPTION_WRITE_COST = 50;
/** Quota cost of a single subscriptions.list page. */
export const SUBSCRIPTION_LIST_COST = 1;
/** Google's default per-project daily allowance. */
export const DEFAULT_DAILY_QUOTA = 10_000;

/**
 * Default writes per run.
 *
 * Deliberately tiny. The daily quota is per *project*, not per user, so a run
 * big enough to use it up takes YouTube search and subscription browsing down
 * with it for everyone until midnight Pacific. Raising this is a decision the
 * operator makes per run, with the cost shown, rather than a default they
 * inherit by clicking once.
 */
export const DEFAULT_MAX_WRITES_PER_RUN = 2;

/** Stop paginating existing subscriptions after this many pages (50 per page). */
const MAX_SUBSCRIPTION_PAGES = 60;

export interface RunSummary {
  /** Writes this run will actually attempt. */
  writes: number;
  /** Quota units those writes cost. */
  quotaUnits: number;
  /** Pending channels this run will not reach. */
  leftover: number;
  /** Share of a full day's project-wide allowance this run consumes, 0-1. */
  dailyQuotaShare: number;
}

/**
 * What a run will actually do, given the plan and the cap. Kept here rather
 * than in the UI so the number on the button cannot drift from the number the
 * executor uses.
 */
export function describeRun(pendingCount: number, maxWrites: number): RunSummary {
  const safePending = Math.max(0, Math.floor(pendingCount));
  const safeMax = Number.isFinite(maxWrites) && maxWrites > 0 ? Math.floor(maxWrites) : 0;
  const writes = Math.min(safePending, safeMax);
  const quotaUnits = writes * SUBSCRIPTION_WRITE_COST;

  return {
    writes,
    quotaUnits,
    leftover: safePending - writes,
    dailyQuotaShare: quotaUnits / DEFAULT_DAILY_QUOTA,
  };
}

export type BulkAction = 'subscribe' | 'unsubscribe';

export interface BulkChannelInput {
  channelId: string;
  title?: string | null;
}

export interface BulkPlanItem {
  channelId: string;
  title: string | null;
  /** Present for unsubscribes, where the id is already known from the diff. */
  subscriptionId?: string;
}

export interface BulkPlan {
  action: BulkAction;
  /** Channels that need an API write. */
  pending: BulkPlanItem[];
  /** Channels already in the desired state — these cost nothing. */
  skipped: BulkPlanItem[];
  /** Quota units the pending writes will consume. */
  estimatedQuotaUnits: number;
  /** Units already spent listing existing subscriptions while planning. */
  planningQuotaUnits: number;
  /** False when the pending writes exceed a single day's default allowance. */
  withinDailyQuota: boolean;
  /** How many writes fit in the default daily allowance. */
  dailyWriteCapacity: number;
}

export interface BulkItemResult {
  channelId: string;
  title: string | null;
  status: 'ok' | 'failed';
  error?: string;
}

export interface BulkRunResult {
  action: BulkAction;
  succeeded: BulkItemResult[];
  failed: BulkItemResult[];
  /** Items never attempted — quota ran out, the cap was hit, or it was aborted. */
  remaining: BulkPlanItem[];
  quotaUnitsSpent: number;
  /** True when the run stopped early because YouTube reported quota exhaustion. */
  quotaExceeded: boolean;
}

export interface ExecuteBulkOptions {
  /** Hard cap on writes for this run. Defaults to the whole plan. */
  maxWrites?: number;
  /** Called after each attempted write, for streaming progress. */
  onProgress?: (result: BulkItemResult, index: number, total: number) => void;
  /** Abort an in-flight run. */
  signal?: AbortSignal;
  /** Milliseconds to pause between writes; keeps below the per-second limits. */
  delayMs?: number;
}

/**
 * Detects the 403 `quotaExceeded` / `rateLimitExceeded` family. Continuing
 * after one of these just burns the rest of the list into failures.
 */
export function isQuotaExceededError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('quotaexceeded') ||
    message.includes('quota exceeded') ||
    message.includes('dailylimitexceeded') ||
    message.includes('ratelimitexceeded')
  );
}

/** True when the failure is permanent for this channel and should not be retried. */
function isPermanentChannelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('subscriptionduplicate') ||
    message.includes('channelnotfound') ||
    message.includes('subscribernotfound') ||
    message.includes('accountclosed') ||
    message.includes('accountsuspended')
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true }
    );
  });
}

/**
 * Fetch every channel the account is currently subscribed to, as a
 * channelId -> subscriptionId map. Costs 1 unit per 50 channels.
 */
export async function fetchAllSubscriptions(
  account: YouTubeAccount
): Promise<{ map: Map<string, string>; titles: Map<string, string>; quotaUnits: number }> {
  const map = new Map<string, string>();
  const titles = new Map<string, string>();
  let pageToken: string | undefined;
  let quotaUnits = 0;

  for (let page = 0; page < MAX_SUBSCRIPTION_PAGES; page += 1) {
    const response = await listSubscribedChannels(account, pageToken);
    quotaUnits += SUBSCRIPTION_LIST_COST;

    for (const item of response.items) {
      map.set(item.channelId, item.subscriptionId);
      if (item.title) titles.set(item.channelId, item.title);
    }

    if (!response.nextPageToken) break;
    pageToken = response.nextPageToken;
  }

  return { map, titles, quotaUnits };
}

/**
 * Diff the requested channels against what the account already has, so only
 * real changes cost quota.
 */
export async function planBulkSubscriptions(
  account: YouTubeAccount,
  action: BulkAction,
  channels: readonly BulkChannelInput[]
): Promise<BulkPlan> {
  const { map: existing, titles, quotaUnits: planningQuotaUnits } = await fetchAllSubscriptions(account);

  const pending: BulkPlanItem[] = [];
  const skipped: BulkPlanItem[] = [];
  const seen = new Set<string>();

  for (const channel of channels) {
    const channelId = channel.channelId.trim();
    if (!channelId || seen.has(channelId)) continue;
    seen.add(channelId);

    const title = channel.title ?? titles.get(channelId) ?? null;
    const subscriptionId = existing.get(channelId);
    const isSubscribed = subscriptionId !== undefined;

    if (action === 'subscribe') {
      if (isSubscribed) skipped.push({ channelId, title, subscriptionId });
      else pending.push({ channelId, title });
    } else {
      if (isSubscribed) pending.push({ channelId, title, subscriptionId });
      else skipped.push({ channelId, title });
    }
  }

  const estimatedQuotaUnits = pending.length * SUBSCRIPTION_WRITE_COST;
  const dailyWriteCapacity = Math.floor(DEFAULT_DAILY_QUOTA / SUBSCRIPTION_WRITE_COST);

  return {
    action,
    pending,
    skipped,
    estimatedQuotaUnits,
    planningQuotaUnits,
    withinDailyQuota: estimatedQuotaUnits + planningQuotaUnits <= DEFAULT_DAILY_QUOTA,
    dailyWriteCapacity,
  };
}

/**
 * Subscribe without the usual pre-flight existence probe — the plan already
 * proved this channel is not subscribed, so the extra unit would be wasted.
 */
async function insertSubscription(account: YouTubeAccount, channelId: string): Promise<void> {
  await ytFetch(account, {
    path: '/subscriptions',
    method: 'POST',
    params: { part: 'snippet' },
    body: {
      snippet: {
        resourceId: { kind: 'youtube#channel', channelId },
      },
    },
  });
}

/**
 * Run the plan's writes sequentially, stopping cleanly on quota exhaustion or
 * abort so the caller can resume from `remaining`.
 */
export async function executeBulkSubscriptions(
  account: YouTubeAccount,
  plan: BulkPlan,
  options: ExecuteBulkOptions = {}
): Promise<BulkRunResult> {
  const { onProgress, signal, delayMs = 0 } = options;
  const maxWrites = Math.max(0, Math.min(options.maxWrites ?? plan.pending.length, plan.pending.length));

  const succeeded: BulkItemResult[] = [];
  const failed: BulkItemResult[] = [];
  let quotaUnitsSpent = 0;
  let quotaExceeded = false;
  let index = 0;

  for (; index < maxWrites; index += 1) {
    if (signal?.aborted) break;

    const item = plan.pending[index];
    try {
      if (plan.action === 'subscribe') {
        await insertSubscription(account, item.channelId);
      } else {
        await unsubscribeFromChannel(account, {
          subscriptionId: item.subscriptionId,
          channelId: item.channelId,
        });
      }

      quotaUnitsSpent += SUBSCRIPTION_WRITE_COST;
      const result: BulkItemResult = { channelId: item.channelId, title: item.title, status: 'ok' };
      succeeded.push(result);
      onProgress?.(result, index, maxWrites);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        // The write did not land, but the attempt still cost its units.
        quotaUnitsSpent += SUBSCRIPTION_WRITE_COST;
        quotaExceeded = true;
        break;
      }

      quotaUnitsSpent += SUBSCRIPTION_WRITE_COST;
      const result: BulkItemResult = {
        channelId: item.channelId,
        title: item.title,
        status: 'failed',
        error: errorMessage(err),
      };
      failed.push(result);
      onProgress?.(result, index, maxWrites);

      // A permanent per-channel error is not a reason to abandon the run.
      if (!isPermanentChannelError(err)) {
        // Transient errors get one short backoff before moving on.
        await sleep(Math.max(delayMs, 250), signal).catch(() => undefined);
      }
      continue;
    }

    if (delayMs > 0 && index < maxWrites - 1) {
      try {
        await sleep(delayMs, signal);
      } catch {
        index += 1;
        break;
      }
    }
  }

  return {
    action: plan.action,
    succeeded,
    failed,
    remaining: plan.pending.slice(index),
    quotaUnitsSpent,
    quotaExceeded,
  };
}
