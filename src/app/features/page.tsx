'use client';

/**
 * /features: what a membership includes.
 *
 * The page a member lands on (the proxy sends `/` here in legal mode). A member bought a
 * plan and found nothing behind it; this is the answer to "what did I just pay for", and
 * for a member without a plan, what a plan opens. Every card comes from the same list the
 * proxy enforces (PAID_FEATURES in src/lib/legal-mode.ts), so the page cannot promise a
 * feature the gate refuses.
 */

import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { useAuth } from '@/hooks/use-auth';
import { PAID_FEATURES, WATCH_PARTY_HOST } from '@/lib/legal-mode';
import { cn } from '@/lib/utils';

interface Card {
  key: string;
  label: string;
  blurb: string;
  href: string;
}

const FREE: Card[] = [
  { key: 'podcasts', label: 'Podcasts', blurb: 'Subscribe to any show and play it here.', href: '/podcasts' },
  { key: 'email', label: 'Email', blurb: 'Read your own mailboxes in one place.', href: '/email' },
  { key: 'party-join', label: 'Join watch parties', blurb: 'Got a party code? Watch along, in sync, with chat.', href: '/watch-party' },
  { key: 'invites', label: 'Invites', blurb: 'Five invites a month. You and your friend each get 7 Premium days.', href: '/invites' },
];

export default function FeaturesPage(): React.ReactElement {
  const { isPremium, isLoading, user } = useAuth();
  const paid: Card[] = [...PAID_FEATURES, WATCH_PARTY_HOST];
  const onTrial = user?.subscription_tier === 'trial' && isPremium;

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="text-center">
          <h1 className="mb-3 text-3xl font-bold text-text-primary">
            {isPremium ? 'Your membership' : 'What a plan includes'}
          </h1>
          <p className="mx-auto max-w-xl text-text-secondary">
            {isLoading
              ? 'Checking your plan.'
              : isPremium
                ? onTrial
                  ? 'You are on the free trial, so everything below is open. Subscribe to keep it when the trial ends.'
                  : 'Everything below is open on your plan.'
                : 'Your account is free and keeps the basics. A plan opens your own tools: your playlists, your seedbox, your feeds, your camera.'}
          </p>
          {!isLoading && (!isPremium || onTrial) ? (
            <Link
              href="/pricing"
              className="mt-4 inline-block rounded-lg bg-accent-primary px-5 py-2.5 font-medium text-white transition-colors hover:bg-accent-primary/90"
            >
              See plans from $4.99 a year
            </Link>
          ) : null}
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">With a plan</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paid.map((f) => {
              const open = isPremium;
              return (
                <li key={f.key}>
                  <Link
                    href={open ? f.href : `/pricing?upgrade=${f.key}`}
                    className={cn(
                      'flex h-full flex-col rounded-xl border p-5 transition-colors',
                      open
                        ? 'border-accent-primary/40 bg-accent-primary/5 hover:border-accent-primary'
                        : 'border-border-subtle bg-bg-secondary hover:border-accent-primary/50'
                    )}
                  >
                    <span className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-semibold text-text-primary">{f.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          open ? 'bg-status-success/20 text-status-success' : 'bg-bg-tertiary text-text-muted'
                        )}
                      >
                        {open ? 'Included' : 'Plan'}
                      </span>
                    </span>
                    <span className="text-sm text-text-secondary">{f.blurb}</span>
                    <span className="mt-3 text-sm font-medium text-accent-primary">{open ? 'Open' : 'Unlock with a plan'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">Every account</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FREE.map((f) => (
              <li key={f.key}>
                <Link
                  href={f.href}
                  className="flex h-full flex-col rounded-xl border border-border-subtle bg-bg-secondary p-5 transition-colors hover:border-accent-primary/50"
                >
                  <span className="mb-2 font-semibold text-text-primary">{f.label}</span>
                  <span className="text-sm text-text-secondary">{f.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </MainLayout>
  );
}
