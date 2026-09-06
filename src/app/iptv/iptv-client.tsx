'use client';

/**
 * Live TV passes: the sales page and the "you already have one" page.
 *
 * Nothing is charged here. A term is chosen and the reader is sent to the
 * account's IPTV tab with it preselected, where the crypto picker and the
 * CoinPay handoff already exist. Signed out, the same button goes through
 * login and back to the tab, so the choice is not lost on the way.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { useAuth } from '@/hooks/use-auth';
import { IptvOfferCard, OFFERED_PACKAGES } from '@/components/live-tv/iptv-offer-card';
import type { ArgonTVPackageKey } from '@/lib/argontv/types';

interface SubscriptionSummary {
  isActive: boolean;
  daysRemaining: number;
  subscription: { expires_at: string; package_key: string } | null;
}

function isOffered(key: string | null): key is ArgonTVPackageKey {
  return key !== null && (OFFERED_PACKAGES as readonly string[]).includes(key);
}

const FEATURES: ReadonlyArray<[title: string, body: string]> = [
  [
    'Plays where you already are',
    'Your channels show up in Live TV here, with favourites, search and the guide. Or take the M3U link into VLC, Kodi, TiviMate, anything.',
  ],
  [
    'Sports, news, films, everywhere',
    'Live sports from every major league, news from every continent, films and series channels, in the languages you actually watch.',
  ],
  [
    'Crypto, no card, no contract',
    'Pay once for the term with USDC, BTC, ETH or the rest. It ends when it ends; buy again to extend, and the same line comes back.',
  ],
  [
    'Rent it out by the game',
    'Already pay for a line elsewhere? List it on Live TV and sell time on it by the game, and let the card above pay for itself.',
  ],
];

export function IptvPassPage(): React.ReactElement {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const params = useSearchParams();
  const wanted = params.get('package');
  const highlight: ArgonTVPackageKey = isOffered(wanted) ? wanted : '12_months';

  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    fetch('/api/iptv/subscription')
      .then((r) => (r.ok ? (r.json() as Promise<SubscriptionSummary>) : null))
      .then((data) => {
        if (!cancelled && data) setSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const active = Boolean(summary?.isActive);
  const manageHref = `/account?tab=iptv&package=${highlight}`;
  const buyHref = isLoggedIn ? manageHref : `/login?redirect=${encodeURIComponent(manageHref)}`;

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Live TV passes</h1>
          <p className="mt-2 max-w-2xl text-text-secondary">
            A line of our own, sold by the month. It drops into Live TV here the moment the
            payment settles, and the M3U link works in any player you already use.
          </p>
        </div>

        {active && summary ? (
          <div
            role="status"
            className="rounded-lg border border-status-success/40 bg-status-success/10 p-4"
          >
            <p className="font-medium text-text-primary">
              Your pass is active with {summary.daysRemaining} day
              {summary.daysRemaining === 1 ? '' : 's'} left.
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Extend it below and the time stacks on the end.{' '}
              <Link href="/account?tab=iptv" className="text-accent-primary hover:underline">
                Manage it in your account
              </Link>{' '}
              or{' '}
              <Link href="/live-tv" className="text-accent-primary hover:underline">
                open Live TV
              </Link>
              .
            </p>
          </div>
        ) : null}

        <IptvOfferCard variant="full" direct highlight={highlight} />

        {!authLoading && !isLoggedIn ? (
          <p className="text-sm text-text-muted">
            You will be asked to sign in first; the term you picked is kept.{' '}
            <Link href={buyHref} className="text-accent-primary hover:underline">
              Sign in and continue
            </Link>
            .
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <h3 className="font-medium text-text-primary">{title}</h3>
              <p className="mt-1 text-sm text-text-secondary">{body}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-text-muted">
          Have your own line?{' '}
          <Link href="/live-tv/rent-out" className="text-accent-primary hover:underline">
            Rent it out by the game
          </Link>
          . Want the whole site?{' '}
          <Link href="/pricing" className="text-accent-primary hover:underline">
            See the plans
          </Link>
          .
        </p>
      </div>
    </MainLayout>
  );
}
