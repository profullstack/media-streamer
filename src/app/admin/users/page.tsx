import { requireAdminPage } from '@/lib/admin';
import { clampLimit, listAdminUsers, parseSortDirection, parseUserSortKey } from '@/lib/admin-stats';
import { UsersTable } from './users-table';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireAdminPage('/admin/users');
  const params = await searchParams;

  const search = first(params.search) ?? '';
  const sort = parseUserSortKey(first(params.sort));
  const dir = parseSortDirection(first(params.dir));
  const limit = clampLimit(Number.parseInt(first(params.limit) ?? '', 10));
  const pageNumber = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);
  const offset = (pageNumber - 1) * limit;

  let page: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  let error: string | null = null;
  try {
    page = await listAdminUsers({ search, sort, dir, limit, offset });
  } catch (err) {
    console.error('[Admin] Failed to list users:', err);
    error = err instanceof Error ? err.message : 'Failed to load users';
  }

  if (!page) {
    return (
      <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">
        Users unavailable: {error}
      </p>
    );
  }

  return (
    <UsersTable
      page={page}
      pageNumber={pageNumber}
      search={search}
      currentAdminId={admin.id}
    />
  );
}
