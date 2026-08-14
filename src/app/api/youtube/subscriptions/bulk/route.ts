/**
 * POST /api/youtube/subscriptions/bulk
 *
 * Bulk subscribe/unsubscribe against a list of channels.
 *
 * Body:
 *   accountId  (optional) which connected YouTube account to use.
 *   action     'subscribe' | 'unsubscribe'
 *   channels   (optional) array of channel ids / channel URLs.
 *   text       (optional) raw list text, e.g. the Kagi smallweb smallyt.txt.
 *              One of `channels` or `text` is required.
 *   dryRun     defaults to TRUE — returns the plan without writing anything.
 *              Pass `false` to actually apply it.
 *   maxWrites  (optional) cap the writes for this run, to stay inside quota.
 *
 * Lists are never fetched server-side; the caller supplies the content.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { hasYouTubeSubscriptionManageScope } from '@/lib/youtube';
import {
  DEFAULT_DAILY_QUOTA,
  SUBSCRIPTION_WRITE_COST,
  executeBulkSubscriptions,
  isQuotaExceededError,
  planBulkSubscriptions,
  type BulkAction,
  type BulkChannelInput,
} from '@/lib/youtube/bulk';
import { parseChannelList } from '@/lib/youtube/channel-list';
import { isResponse, resolveYouTubeAccount } from '@/lib/youtube/resolve-account';
import { getUserIdFromRequest } from '@/lib/youtube/request-auth';

/** Guard rail so one request cannot queue an unbounded amount of work. */
const MAX_CHANNELS_PER_REQUEST = 1000;

interface BulkRequestBody {
  accountId?: unknown;
  action?: unknown;
  channels?: unknown;
  text?: unknown;
  dryRun?: unknown;
  maxWrites?: unknown;
}

function isInsufficientScopeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('access_token_scope_insufficient') ||
    message.includes('insufficient authentication scopes') ||
    message.includes('insufficient permission') ||
    message.includes('insufficientpermissions')
  );
}

function reconnectManageResponse(): Response {
  return NextResponse.json(
    {
      error: 'needs_reconnect',
      message:
        'This YouTube account is missing subscription management access. Reconnect it from Manage accounts, then try again.',
    },
    { status: 412 }
  );
}

function quotaResponse(): Response {
  return NextResponse.json(
    {
      error: 'quota_exceeded',
      message:
        'The YouTube API daily quota is exhausted. It resets at midnight Pacific time — re-run to continue where this left off.',
    },
    { status: 429 }
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireActiveSubscription(request);
  if (guard) return guard;

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as BulkRequestBody;

  const action: BulkAction | null =
    body.action === 'subscribe' || body.action === 'unsubscribe' ? body.action : null;
  if (!action) {
    return NextResponse.json(
      { error: "Missing required body field: action must be 'subscribe' or 'unsubscribe'" },
      { status: 400 }
    );
  }

  // Collect channels from either an explicit array or raw list text.
  const channels: BulkChannelInput[] = [];
  let unresolved: string[] = [];

  if (Array.isArray(body.channels)) {
    const joined = body.channels.filter((c): c is string => typeof c === 'string').join('\n');
    const parsed = parseChannelList(joined);
    channels.push(...parsed.entries);
    unresolved = parsed.unresolved;
  } else if (typeof body.text === 'string') {
    const parsed = parseChannelList(body.text);
    channels.push(...parsed.entries);
    unresolved = parsed.unresolved;
  } else {
    return NextResponse.json(
      { error: 'Missing required body field: channels or text' },
      { status: 400 }
    );
  }

  if (channels.length === 0) {
    return NextResponse.json(
      { error: 'no_channels', message: 'No YouTube channel ids were found in the supplied list.', unresolved },
      { status: 400 }
    );
  }

  if (channels.length > MAX_CHANNELS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: 'too_many_channels',
        message: `This request lists ${channels.length} channels; the maximum is ${MAX_CHANNELS_PER_REQUEST}.`,
      },
      { status: 400 }
    );
  }

  // Writing is opt-in: a bulk run is expensive and, for unsubscribe, destructive.
  const dryRun = body.dryRun !== false;
  const maxWrites =
    typeof body.maxWrites === 'number' && Number.isFinite(body.maxWrites) && body.maxWrites > 0
      ? Math.floor(body.maxWrites)
      : undefined;

  const accountId = typeof body.accountId === 'string' ? body.accountId : null;
  const resolved = await resolveYouTubeAccount(userId, accountId);
  if (isResponse(resolved)) return resolved;

  if (!hasYouTubeSubscriptionManageScope(resolved.scopes)) {
    return reconnectManageResponse();
  }

  try {
    const plan = await planBulkSubscriptions(resolved, action, channels);

    const planPayload = {
      action,
      accountId: resolved.id,
      totalRequested: channels.length,
      pendingCount: plan.pending.length,
      skippedCount: plan.skipped.length,
      pending: plan.pending,
      skipped: plan.skipped,
      unresolved,
      estimatedQuotaUnits: plan.estimatedQuotaUnits,
      planningQuotaUnits: plan.planningQuotaUnits,
      withinDailyQuota: plan.withinDailyQuota,
      dailyWriteCapacity: plan.dailyWriteCapacity,
      quotaUnitCostPerWrite: SUBSCRIPTION_WRITE_COST,
      dailyQuota: DEFAULT_DAILY_QUOTA,
    };

    if (dryRun) {
      return NextResponse.json({ dryRun: true, ...planPayload });
    }

    const run = await executeBulkSubscriptions(resolved, plan, { maxWrites, delayMs: 100 });

    return NextResponse.json({
      dryRun: false,
      ...planPayload,
      succeeded: run.succeeded,
      failed: run.failed,
      remaining: run.remaining,
      succeededCount: run.succeeded.length,
      failedCount: run.failed.length,
      remainingCount: run.remaining.length,
      quotaUnitsSpent: run.quotaUnitsSpent,
      quotaExceeded: run.quotaExceeded,
    });
  } catch (err) {
    if (isInsufficientScopeError(err)) {
      return reconnectManageResponse();
    }
    if (isQuotaExceededError(err)) {
      return quotaResponse();
    }
    console.error('[YouTube] bulk subscriptions failed:', err);
    return NextResponse.json({ error: 'YouTube bulk subscription update failed' }, { status: 502 });
  }
}
