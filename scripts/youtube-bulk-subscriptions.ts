#!/usr/bin/env npx tsx

/**
 * Bulk subscribe / unsubscribe a connected YouTube account against a channel list.
 *
 * Built for lists like the Kagi smallweb feed:
 *   https://raw.githubusercontent.com/kagisearch/smallweb/refs/heads/main/smallyt.txt
 *
 * Quota reality: subscriptions.insert and subscriptions.delete each cost 50 of
 * the default 10,000 units/day, so roughly 200 writes per day for the whole
 * project. A 257-channel list therefore needs two days. This script plans
 * before it writes, stops the moment YouTube reports quota exhaustion, and
 * writes the untouched remainder to a resume file so the next run picks up
 * exactly where it stopped.
 *
 * Usage:
 *   # See what would happen (default — writes nothing):
 *   pnpm youtube:bulk --email you@example.com --list <url|path>
 *
 *   # Apply, capped to today's quota:
 *   pnpm youtube:bulk --email you@example.com --list <url|path> --apply --max 200
 *
 *   # Next day, finish the rest:
 *   pnpm youtube:bulk --email you@example.com --list .youtube-bulk-remaining.txt --apply
 *
 *   # Undo:
 *   pnpm youtube:bulk --email you@example.com --list <url|path> --action unsubscribe --apply
 *
 * Flags:
 *   --list <url|path>   Channel list. Required.
 *   --email <email>     Which connected account to act as. Required unless --account-id.
 *   --account-id <id>   Explicit bt_youtube_accounts row id.
 *   --action <a>        subscribe (default) | unsubscribe
 *   --apply             Actually write. Without it the script is a dry run.
 *   --max <n>           Cap writes this run. Defaults to the daily capacity (200).
 *   --state <path>      Where to write the remainder. Default .youtube-bulk-remaining.txt
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { parseChannelList } from '../src/lib/youtube/channel-list';
import {
  DEFAULT_DAILY_QUOTA,
  SUBSCRIPTION_WRITE_COST,
  executeBulkSubscriptions,
  planBulkSubscriptions,
  type BulkAction,
} from '../src/lib/youtube/bulk';
import { hasYouTubeSubscriptionManageScope } from '../src/lib/youtube/config';
import { listAccountsForUser } from '../src/lib/youtube/repository';
import type { YouTubeAccount } from '../src/lib/youtube/types';

const DEFAULT_STATE_PATH = '.youtube-bulk-remaining.txt';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function loadList(source: string): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      fail(`Could not fetch list (${response.status}): ${source}`);
    }
    return response.text();
  }
  return readFile(source, 'utf8');
}

async function resolveAccount(): Promise<YouTubeAccount> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run via `pnpm youtube:bulk`, which loads .env)');
  }

  const email = arg('email');
  const accountId = arg('account-id');
  if (!email && !accountId) {
    fail('Pass --email <address> (or --account-id <id>) to choose the connected YouTube account');
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look the row up directly so either selector works without a session.
  const query = supabase.from('bt_youtube_accounts').select('user_id, id, email');
  const { data, error } = accountId
    ? await query.eq('id', accountId).maybeSingle()
    : await query.eq('email', email!).order('is_default', { ascending: false }).limit(1).maybeSingle();

  if (error) fail(`Account lookup failed: ${error.message}`);
  if (!data) fail(`No connected YouTube account found for ${accountId ?? email}`);

  const accounts = await listAccountsForUser(data.user_id);
  const account = accounts.find((a) => a.id === data.id);
  if (!account) fail(`Account ${data.id} vanished during lookup`);

  return account;
}

async function main(): Promise<void> {
  const listSource = arg('list');
  if (!listSource) fail('Pass --list <url|path>');

  const action = (arg('action') ?? 'subscribe') as BulkAction;
  if (action !== 'subscribe' && action !== 'unsubscribe') {
    fail("--action must be 'subscribe' or 'unsubscribe'");
  }

  const apply = flag('apply');
  const statePath = arg('state') ?? DEFAULT_STATE_PATH;
  const dailyCapacity = Math.floor(DEFAULT_DAILY_QUOTA / SUBSCRIPTION_WRITE_COST);
  const maxWrites = Number(arg('max') ?? dailyCapacity);
  if (!Number.isFinite(maxWrites) || maxWrites <= 0) fail('--max must be a positive number');

  const raw = await loadList(listSource!);
  const parsed = parseChannelList(raw);

  console.log(`List: ${listSource}`);
  console.log(`  ${parsed.entries.length} channels, ${parsed.duplicateCount} duplicates collapsed`);
  if (parsed.unresolved.length > 0) {
    console.log(`  ⚠ ${parsed.unresolved.length} lines had no channel id (handle-only URLs need a lookup):`);
    for (const line of parsed.unresolved.slice(0, 5)) console.log(`      ${line}`);
    if (parsed.unresolved.length > 5) console.log(`      … and ${parsed.unresolved.length - 5} more`);
  }
  if (parsed.entries.length === 0) fail('No channel ids found in the list');

  const account = await resolveAccount();
  console.log(`Account: ${account.email} (${account.id})`);

  if (!hasYouTubeSubscriptionManageScope(account.scopes)) {
    fail('This account lacks the youtube.force-ssl scope — reconnect it from /youtube/accounts first');
  }

  console.log(`\nPlanning ${action}…`);
  const plan = await planBulkSubscriptions(account, action, parsed.entries);

  console.log(`  already ${action === 'subscribe' ? 'subscribed' : 'not subscribed'}: ${plan.skipped.length}`);
  console.log(`  needing a write: ${plan.pending.length}`);
  console.log(`  quota: ${plan.estimatedQuotaUnits} units (+${plan.planningQuotaUnits} planning) of ${DEFAULT_DAILY_QUOTA}/day`);

  if (!plan.withinDailyQuota) {
    const days = Math.ceil(plan.pending.length / dailyCapacity);
    console.log(`  ⚠ exceeds one day of quota — this needs ~${days} days at ${dailyCapacity} writes/day`);
  }

  if (plan.pending.length === 0) {
    console.log('\n✓ Nothing to do.');
    return;
  }

  if (!apply) {
    console.log('\nDry run — no changes made. Re-run with --apply to execute.');
    console.log('First few pending:');
    for (const item of plan.pending.slice(0, 10)) {
      console.log(`  ${item.channelId}  ${item.title ?? ''}`);
    }
    return;
  }

  const willAttempt = Math.min(maxWrites, plan.pending.length);
  console.log(`\nApplying ${willAttempt} ${action} writes…`);

  const result = await executeBulkSubscriptions(account, plan, {
    maxWrites,
    delayMs: 120,
    onProgress: (item, index, total) => {
      const marker = item.status === 'ok' ? '✓' : '✗';
      const suffix = item.error ? ` — ${item.error}` : '';
      console.log(`  [${index + 1}/${total}] ${marker} ${item.title ?? item.channelId}${suffix}`);
    },
  });

  console.log(`\nDone: ${result.succeeded.length} ok, ${result.failed.length} failed, ${result.remaining.length} not attempted`);
  console.log(`Quota spent this run: ~${result.quotaUnitsSpent} units`);

  if (result.quotaExceeded) {
    console.log('⚠ Stopped early: YouTube reported quota exhaustion. It resets at midnight Pacific.');
  }

  if (result.remaining.length > 0) {
    const body = result.remaining
      .map((item) => (item.title ? `${item.channelId} # ${item.title}` : item.channelId))
      .join('\n');
    await writeFile(statePath, `${body}\n`, 'utf8');
    console.log(`\nRemaining ${result.remaining.length} written to ${statePath}`);
    console.log(`Resume with:  pnpm youtube:bulk --email ${account.email} --list ${statePath} --action ${action} --apply`);
  }
}

main().catch((err) => {
  console.error('✗ Bulk run failed:', err);
  process.exit(1);
});
