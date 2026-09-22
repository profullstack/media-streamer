import { requireAdminPage } from '@/lib/admin';
import { getAdminPlatformStats } from '@/lib/admin-stats';
import { StatsOverview } from './stats-overview';
import { UpgradeForm } from './upgrade-form';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdminPage('/admin');

  let stats: Awaited<ReturnType<typeof getAdminPlatformStats>> | null = null;
  let statsError: string | null = null;
  try {
    stats = await getAdminPlatformStats();
  } catch (error) {
    console.error('[Admin] Failed to load platform stats:', error);
    statsError = error instanceof Error ? error.message : 'Failed to load stats';
  }

  return (
    <div className="space-y-10">
      {stats ? (
        <StatsOverview stats={stats} />
      ) : (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">
          Stats unavailable: {statsError}
        </p>
      )}

      <section className="rounded-lg border border-border-subtle bg-bg-secondary p-5">
        <UpgradeForm />
      </section>
    </div>
  );
}
