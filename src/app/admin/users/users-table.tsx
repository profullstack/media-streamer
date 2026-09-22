'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { AdminUserPage, AdminUserRow, UserSortKey } from '@/lib/admin-stats';
import { setUserAdminByUserId } from '@/app/actions/admin';

const COLUMNS: Array<{ key: UserSortKey; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'tier', label: 'Plan' },
  { key: 'paid_usd', label: 'Paid' },
  { key: 'created_at', label: 'Joined' },
  { key: 'last_sign_in_at', label: 'Last seen' },
];

function day(value: string | null): string {
  return value ? value.slice(0, 10) : 'never';
}

function usd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function planLabel(row: AdminUserRow): string {
  const expired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
  if (row.tier === 'trial') return expired || row.status !== 'active' ? 'trial (expired)' : 'trial';
  return row.status === 'active' && !expired ? row.tier : `${row.tier} (${expired ? 'expired' : row.status})`;
}

function buildHref(params: { search: string; sort: UserSortKey; dir: 'asc' | 'desc'; page: number; limit: number }): string {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  query.set('sort', params.sort);
  query.set('dir', params.dir);
  if (params.page > 1) query.set('page', String(params.page));
  if (params.limit !== 50) query.set('limit', String(params.limit));
  return `/admin/users?${query.toString()}`;
}

export function UsersTable({
  page,
  pageNumber,
  search,
  currentAdminId,
}: {
  page: AdminUserPage;
  pageNumber: number;
  search: string;
  currentAdminId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));
  const base = { search, sort: page.sort, dir: page.dir, page: pageNumber, limit: page.limit };

  const toggleAdmin = (row: AdminUserRow) => {
    const verb = row.is_admin ? 'Revoke admin from' : 'Make';
    if (!confirm(`${verb} ${row.email ?? row.id}${row.is_admin ? '' : ' an admin'}?`)) return;
    setError(null);
    setBusyId(row.id);
    start(async () => {
      const result = await setUserAdminByUserId({ userId: row.id, isAdmin: !row.is_admin });
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <form method="get" action="/admin/users" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search email, username or user id"
          className="min-w-64 flex-1 rounded border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
        />
        <input type="hidden" name="sort" value={page.sort} />
        <input type="hidden" name="dir" value={page.dir} />
        <button
          type="submit"
          className="rounded bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
        >
          Search
        </button>
        {search ? (
          <Link href={buildHref({ ...base, search: '', page: 1 })} className="text-sm text-text-secondary underline">
            Clear
          </Link>
        ) : null}
        <span className="ml-auto text-sm text-text-muted">
          {page.total.toLocaleString()} account{page.total === 1 ? '' : 's'}
        </span>
      </form>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-bg-secondary">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-subtle text-xs uppercase tracking-wider text-text-muted">
            <tr>
              {COLUMNS.map((column) => {
                const active = page.sort === column.key;
                const nextDir = active && page.dir === 'desc' ? 'asc' : 'desc';
                return (
                  <th key={column.key} className="px-3 py-2">
                    <Link
                      href={buildHref({ ...base, sort: column.key, dir: nextDir, page: 1 })}
                      className={cn('hover:text-text-primary', active && 'text-text-primary')}
                    >
                      {column.label}
                      {active ? (page.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </Link>
                  </th>
                );
              })}
              <th className="px-3 py-2">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {page.rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-6 text-center text-text-muted">
                  No accounts match.
                </td>
              </tr>
            ) : (
              page.rows.map((row) => (
                <tr key={row.id} className={cn(row.banned && 'opacity-60')}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-text-primary">{row.email ?? row.id}</div>
                    <div className="text-xs text-text-muted">
                      {row.username ? `@${row.username}` : 'no username'}
                      {!row.confirmed ? ' · unconfirmed' : ''}
                      {row.banned ? ' · banned' : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    <div>{planLabel(row)}</div>
                    {row.expires_at ? <div className="text-xs text-text-muted">until {day(row.expires_at)}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {row.paid_count > 0 ? `${usd(row.paid_usd)} (${row.paid_count})` : '—'}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{day(row.created_at)}</td>
                  <td className="px-3 py-2 text-text-secondary">{day(row.last_sign_in_at)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending || row.id === currentAdminId}
                      onClick={() => toggleAdmin(row)}
                      title={row.id === currentAdminId ? 'You cannot change your own admin flag' : undefined}
                      className={cn(
                        'rounded border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                        row.is_admin
                          ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
                          : 'border-border-default text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                      )}
                    >
                      {busyId === row.id ? 'Saving' : row.is_admin ? 'Admin' : 'Make admin'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-text-muted">
        <span>
          Page {pageNumber} of {pageCount}
        </span>
        <div className="flex gap-2">
          {pageNumber > 1 ? (
            <Link href={buildHref({ ...base, page: pageNumber - 1 })} className="rounded border border-border-default px-3 py-1 hover:bg-bg-hover">
              Previous
            </Link>
          ) : null}
          {pageNumber < pageCount ? (
            <Link href={buildHref({ ...base, page: pageNumber + 1 })} className="rounded border border-border-default px-3 py-1 hover:bg-bg-hover">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
