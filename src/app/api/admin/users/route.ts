import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { requireAdminUser } from '@/lib/admin';
import { listAdminUsers } from '@/lib/admin-stats';

/**
 * GET /api/admin/users — the user directory, one row per auth account.
 *
 * ?search= matches email, username or exact user id. ?sort= is one of
 * created_at | last_sign_in_at | email | paid_usd | tier, ?dir= asc|desc,
 * ?limit= (1..500, default 50) and ?offset= page through the result.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await requireAdminUser(user.id))) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const parsedLimit = Number.parseInt(params.get('limit') ?? '', 10);
  const parsedOffset = Number.parseInt(params.get('offset') ?? '', 10);

  try {
    const page = await listAdminUsers({
      search: params.get('search'),
      sort: params.get('sort'),
      dir: params.get('dir'),
      limit: Number.isFinite(parsedLimit) ? parsedLimit : null,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : null,
    });
    // Never cache: this is every account on the platform.
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[admin/users] failed', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}
