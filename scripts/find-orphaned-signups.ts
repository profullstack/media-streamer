#!/usr/bin/env npx tsx

/**
 * Find orphaned/duplicate accounts from failed signups.
 *
 * Lists unconfirmed auth.users rows so we can decide which to delete.
 * Read-only — does not delete anything.
 *
 * Usage:
 *   pnpm tsx scripts/find-orphaned-signups.ts
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
}

async function main() {
  const all: AuthUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('listUsers error:', error.message);
      process.exit(1);
    }
    all.push(...(data.users as unknown as AuthUser[]));
    if (data.users.length < perPage) break;
    page += 1;
  }

  const unconfirmed = all.filter((u) => !u.email_confirmed_at);
  const confirmed = all.filter((u) => u.email_confirmed_at);

  console.log(`Total users:        ${all.length}`);
  console.log(`Confirmed:          ${confirmed.length}`);
  console.log(`Unconfirmed:        ${unconfirmed.length}`);
  console.log();

  // Bucket unconfirmed by whether they ever signed in
  const neverSignedIn = unconfirmed.filter((u) => !u.last_sign_in_at);
  console.log(`Unconfirmed + never signed in: ${neverSignedIn.length}`);
  console.log();

  // Check which unconfirmed users have a subscription row
  const ids = unconfirmed.map((u) => u.id);
  const { data: subs, error: subsErr } = await supabase
    .from('user_subscriptions')
    .select('user_id')
    .in('user_id', ids);

  if (subsErr) {
    console.error('user_subscriptions query error:', subsErr.message);
    process.exit(1);
  }

  const subIds = new Set((subs ?? []).map((s) => s.user_id));
  const unconfirmedWithSub = unconfirmed.filter((u) => subIds.has(u.id));
  const unconfirmedNoSub = unconfirmed.filter((u) => !subIds.has(u.id));

  console.log(`Unconfirmed WITH user_subscriptions row:    ${unconfirmedWithSub.length}`);
  console.log(`Unconfirmed WITHOUT user_subscriptions row: ${unconfirmedNoSub.length}`);
  console.log();

  // Duplicate-email detection (case-insensitive)
  const byEmail = new Map<string, AuthUser[]>();
  for (const u of all) {
    if (!u.email) continue;
    const k = u.email.toLowerCase();
    const arr = byEmail.get(k) ?? [];
    arr.push(u);
    byEmail.set(k, arr);
  }
  const dupEmails = [...byEmail.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`Distinct emails with >1 auth.users row: ${dupEmails.length}`);
  for (const [email, arr] of dupEmails.slice(0, 20)) {
    console.log(`  ${email}: ${arr.length} rows`);
  }
  console.log();

  // Print a sample of unconfirmed users (most recent first)
  const sample = [...unconfirmed]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30);
  console.log('Most recent unconfirmed users (up to 30):');
  for (const u of sample) {
    const hasSub = subIds.has(u.id) ? 'sub' : 'no-sub';
    console.log(`  ${u.created_at}  ${u.id}  ${u.email ?? '(no email)'}  [${hasSub}]`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
