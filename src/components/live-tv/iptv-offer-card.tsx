/**
 * IPTV Offer Card
 *
 * The one place Live TV passes are pitched. Shown to a reader who has no
 * playlist on the Live TV page, as a section on /pricing, and as the hero on
 * /iptv itself. Every price on it comes from the same table the checkout
 * charges (getAllPackagePrices), so the card can never advertise one number
 * and the account page take another.
 *
 * It sells nothing itself: the button lands on /iptv, or straight on the
 * account's IPTV tab with the package preselected when `direct` is set.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  getAllPackagePrices,
  type ArgonTVPackageKey,
  type IPTVPackagePrice,
} from '@/lib/argontv/types';

/** Packages worth showing on a sales surface: the real terms, not the tests. */
export const OFFERED_PACKAGES: readonly ArgonTVPackageKey[] = [
  '1_month',
  '3_months',
  '6_months',
  '12_months',
];

export function offeredPackages(): IPTVPackagePrice[] {
  return getAllPackagePrices().filter((p) =>
    (OFFERED_PACKAGES as readonly string[]).includes(p.packageKey)
  );
}

/** Where a "Get" button goes: the pass page, or the account tab with the package chosen. */
export function packageHref(packageKey: ArgonTVPackageKey, direct: boolean): string {
  return direct ? `/account?tab=iptv&package=${packageKey}` : `/iptv?package=${packageKey}`;
}

/** Monthly-equivalent price, for the "per month" line under each term. */
export function perMonth(pkg: IPTVPackagePrice): string {
  const months = Math.max(1, Math.round(pkg.durationDays / 30));
  return (pkg.priceUsd / months).toFixed(2);
}

export interface IptvOfferCardProps {
  /** Compact: one line of copy and the four terms as pills. Full: the hero. */
  variant?: 'compact' | 'full';
  /** Send buttons straight to the account tab instead of /iptv. */
  direct?: boolean;
  /** Which term to highlight. */
  highlight?: ArgonTVPackageKey;
  className?: string;
}

export function IptvOfferCard({
  variant = 'compact',
  direct = false,
  highlight = '12_months',
  className,
}: IptvOfferCardProps): React.ReactElement {
  const packages = offeredPackages();
  const cheapest = packages.reduce(
    (best, p) => (Number(perMonth(p)) < Number(perMonth(best)) ? p : best),
    packages[0]!
  );

  return (
    <section
      aria-label="Live TV passes"
      className={cn(
        'rounded-lg border border-accent-primary/30 bg-accent-primary/5',
        variant === 'full' ? 'p-6 sm:p-8' : 'p-4',
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            className={cn(
              'font-semibold text-text-primary',
              variant === 'full' ? 'text-2xl' : 'text-base'
            )}
          >
            Live TV, on our line
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Thousands of live channels and sports, from ${perMonth(cheapest)} a month.
            Plays here in Live TV and in any player that takes an M3U. Paid in crypto,
            no card, no contract.
          </p>
        </div>
        {variant === 'compact' ? (
          <Link
            href={direct ? packageHref(highlight, true) : '/iptv'}
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
          >
            Get a pass
          </Link>
        ) : null}
      </div>

      <ul
        className={cn(
          'mt-4 grid gap-3',
          variant === 'full' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'
        )}
      >
        {packages.map((pkg) => {
          const isHighlight = pkg.packageKey === highlight;
          return (
            <li
              key={pkg.packageKey}
              className={cn(
                'rounded-md border p-3',
                isHighlight
                  ? 'border-accent-primary bg-bg-secondary'
                  : 'border-border-subtle bg-bg-secondary/60'
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">{pkg.displayName}</span>
                {isHighlight ? (
                  <span className="rounded bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-primary">
                    Best value
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-lg font-bold text-text-primary">${pkg.priceUsd.toFixed(2)}</div>
              <div className="text-xs text-text-muted">${perMonth(pkg)} / month</div>
              {variant === 'full' ? (
                <Link
                  href={packageHref(pkg.packageKey, direct)}
                  className={cn(
                    'mt-3 inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isHighlight
                      ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
                      : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
                  )}
                >
                  Get {pkg.displayName}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
