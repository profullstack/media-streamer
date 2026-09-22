import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { requireAdminUser } from '@/lib/admin';
import { getAdminPlatformStats } from '@/lib/admin-stats';

/**
 * GET /api/admin/stats — platform-wide user, subscription, revenue and content counts.
 *
 * Every number spans every account, so the admin check is the entire security
 * boundary. The page at /admin renders the same payload server-side; this route
 * exists for the refresh button and for curl.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await requireAdminUser(user.id))) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const stats = await getAdminPlatformStats();
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[admin/stats] failed', error);
    return NextResponse.json({ error: 'Failed to load platform stats' }, { status: 500 });
  }
}
