/**
 * Admin console data: platform stats and the user directory.
 *
 * Both read auth.users through SECURITY DEFINER Postgres functions that only
 * service_role may execute (supabase/migrations/20260922100000_admin_stats_functions.sql),
 * so the admin check in the calling route or page is the whole security boundary.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerClient } from '@/lib/supabase';

type AnyClient = SupabaseClient<any>;

export type AdminUserCounts = {
  total: number;
  confirmed: number;
  new_24h: number;
  new_7d: number;
  new_30d: number;
  active_24h: number;
  active_7d: number;
  active_30d: number;
  banned: number;
};

export type AdminSubscriptionCounts = {
  trial_active: number;
  trial_expired: number;
  premium_active: number;
  family_active: number;
  paid_lapsed: number;
  cancelled: number;
  expiring_7d: number;
};

export type AdminPaymentTotals = {
  paid_count: number;
  paid_usd: number;
  paid_count_30d?: number;
  paid_usd_30d?: number;
  pending_count?: number;
};

export type AdminContentCounts = {
  user_torrents: number;
  dht_torrents: number | null;
  dht_counted_at: string | null;
  comments: number;
  favorites: number;
  collections: number;
  watchlists: number;
  podcast_subscriptions: number;
  iptv_active: number;
  seedbox_shares: number;
  family_plans: number;
  referral_usages: number;
  viewing_profiles: number;
};

export type AdminPlatformStats = {
  generated_at: string;
  users: AdminUserCounts;
  signups_daily: Array<{ day: string; count: number }>;
  subscriptions: AdminSubscriptionCounts;
  revenue: { subscriptions: AdminPaymentTotals; iptv: AdminPaymentTotals };
  content: AdminContentCounts;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  banned: boolean;
  username: string | null;
  is_admin: boolean;
  tier: 'trial' | 'premium' | 'family';
  status: 'active' | 'cancelled' | 'expired';
  expires_at: string | null;
  paid_usd: number;
  paid_count: number;
};

export const USER_SORT_KEYS = ['created_at', 'last_sign_in_at', 'email', 'paid_usd', 'tier'] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

export type AdminUserPage = {
  total: number;
  limit: number;
  offset: number;
  sort: UserSortKey;
  dir: SortDirection;
  rows: AdminUserRow[];
};

export type ListUsersOptions = {
  search?: string | null;
  sort?: string | null;
  dir?: string | null;
  limit?: number | null;
  offset?: number | null;
};

export function parseUserSortKey(value: string | null | undefined): UserSortKey {
  return (USER_SORT_KEYS as readonly string[]).includes(value ?? '') ? (value as UserSortKey) : 'created_at';
}

export function parseSortDirection(value: string | null | undefined): SortDirection {
  return value?.toLowerCase() === 'asc' ? 'asc' : 'desc';
}

/** Clamp a page size the same way the SQL does, so the response echoes what ran. */
export function clampLimit(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 50;
  return Math.min(Math.max(Math.trunc(value as number), 1), 500);
}

export function clampOffset(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(Math.trunc(value as number), 0);
}

function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

/** numeric columns arrive as strings through PostgREST; normalise the money fields. */
function normaliseTotals(raw: Partial<AdminPaymentTotals> | null | undefined): AdminPaymentTotals {
  return {
    paid_count: toNumber(raw?.paid_count),
    paid_usd: toNumber(raw?.paid_usd),
    paid_count_30d: raw?.paid_count_30d === undefined ? undefined : toNumber(raw.paid_count_30d),
    paid_usd_30d: raw?.paid_usd_30d === undefined ? undefined : toNumber(raw.paid_usd_30d),
    pending_count: raw?.pending_count === undefined ? undefined : toNumber(raw.pending_count),
  };
}

export async function getAdminPlatformStats(
  client: AnyClient = getServerClient() as AnyClient
): Promise<AdminPlatformStats> {
  const { data, error } = await client.rpc('admin_platform_stats');
  if (error) throw new Error(error.message);
  const stats = data as AdminPlatformStats;
  return {
    ...stats,
    revenue: {
      subscriptions: normaliseTotals(stats.revenue?.subscriptions),
      iptv: normaliseTotals(stats.revenue?.iptv),
    },
  };
}

export async function listAdminUsers(
  options: ListUsersOptions = {},
  client: AnyClient = getServerClient() as AnyClient
): Promise<AdminUserPage> {
  const { data, error } = await client.rpc('admin_list_users', {
    p_search: options.search?.trim() || null,
    p_sort: parseUserSortKey(options.sort),
    p_dir: parseSortDirection(options.dir),
    p_limit: clampLimit(options.limit),
    p_offset: clampOffset(options.offset),
  });
  if (error) throw new Error(error.message);
  const page = data as AdminUserPage;
  return {
    ...page,
    rows: (page.rows ?? []).map((row) => ({
      ...row,
      paid_usd: toNumber(row.paid_usd),
      paid_count: toNumber(row.paid_count),
    })),
  };
}
