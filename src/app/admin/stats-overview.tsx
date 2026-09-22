import type { AdminPlatformStats } from '@/lib/admin-stats';

function count(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('en-US');
}

function usd(value: number | null | undefined): string {
  return `$${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : 'never';
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-primary">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

/**
 * Thirty days of signups as plain divs. Recharts is not in this app and a bar
 * a day needs nothing more than a height.
 */
export function SignupsChart({ points }: { points: AdminPlatformStats['signups_daily'] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Signups, last 30 days</h2>
        <span className="text-sm text-text-muted">{count(total)} total</span>
      </div>
      <div
        className="flex h-32 items-end gap-1 rounded-lg border border-border-subtle bg-bg-secondary p-3"
        role="img"
        aria-label={`Daily signups for the last ${points.length} days, ${total} in total`}
      >
        {points.map((p) => (
          <div
            key={p.day}
            title={`${day(p.day)}: ${p.count}`}
            className="flex-1 rounded-t bg-accent-primary/70 hover:bg-accent-primary"
            style={{ height: `${Math.max(2, Math.round((p.count / max) * 100))}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-text-muted">
        <span>{day(points[0]?.day)}</span>
        <span>{day(points[points.length - 1]?.day)}</span>
      </div>
    </section>
  );
}

export function StatsOverview({ stats }: { stats: AdminPlatformStats }) {
  const { users, subscriptions, revenue, content } = stats;
  const paidActive = subscriptions.premium_active + subscriptions.family_active;

  return (
    <div className="space-y-8">
      <Section title="Users">
        <StatCard label="Accounts" value={count(users.total)} hint={`${count(users.confirmed)} confirmed`} />
        <StatCard label="New" value={count(users.new_7d)} hint={`${count(users.new_24h)} today, ${count(users.new_30d)} this month`} />
        <StatCard label="Active (7d)" value={count(users.active_7d)} hint={`${count(users.active_24h)} today, ${count(users.active_30d)} this month`} />
        <StatCard label="Banned" value={count(users.banned)} hint={`${count(content.viewing_profiles)} viewing profiles`} />
      </Section>

      <SignupsChart points={stats.signups_daily} />

      <Section title="Subscriptions">
        <StatCard label="Paying" value={count(paidActive)} hint={`${count(subscriptions.premium_active)} premium, ${count(subscriptions.family_active)} family`} />
        <StatCard label="Trials" value={count(subscriptions.trial_active)} hint={`${count(subscriptions.trial_expired)} expired`} />
        <StatCard label="Expiring in 7 days" value={count(subscriptions.expiring_7d)} hint={`${count(subscriptions.paid_lapsed)} lapsed`} />
        <StatCard label="Cancelled" value={count(subscriptions.cancelled)} />
      </Section>

      <Section title="Revenue">
        <StatCard label="Subscriptions, lifetime" value={usd(revenue.subscriptions.paid_usd)} hint={`${count(revenue.subscriptions.paid_count)} payments`} />
        <StatCard label="Subscriptions, 30 days" value={usd(revenue.subscriptions.paid_usd_30d)} hint={`${count(revenue.subscriptions.paid_count_30d)} payments`} />
        <StatCard label="Pending payments" value={count(revenue.subscriptions.pending_count)} hint="created but never confirmed" />
        <StatCard label="IPTV, lifetime" value={usd(revenue.iptv.paid_usd)} hint={`${count(revenue.iptv.paid_count)} payments`} />
      </Section>

      <Section title="Content">
        <StatCard label="DHT torrents" value={count(content.dht_torrents)} hint={`counted ${day(content.dht_counted_at)}`} />
        <StatCard label="User uploads" value={count(content.user_torrents)} hint={`${count(content.comments)} comments, ${count(content.favorites)} favorites`} />
        <StatCard label="Watchlists" value={count(content.watchlists)} hint={`${count(content.collections)} collections`} />
        <StatCard label="Podcast subscriptions" value={count(content.podcast_subscriptions)} hint={`${count(content.iptv_active)} active IPTV lines`} />
        <StatCard label="Seedbox shares" value={count(content.seedbox_shares)} />
        <StatCard label="Family plans" value={count(content.family_plans)} />
        <StatCard label="Referral signups" value={count(content.referral_usages)} />
        <StatCard label="Generated" value={stats.generated_at.slice(11, 19) + ' UTC'} hint={day(stats.generated_at)} />
      </Section>
    </div>
  );
}
