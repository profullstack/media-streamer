/**
 * What BitTorrented is, and what a plan buys, for someone who is signed out.
 *
 * Anthony, 2026-10-06: someone got an invite and asked what it was for. Anthony,
 * 2026-11-25: "let's start heavily promoting the paid tier for logged out users too".
 * So this is the pitch for the plan, on the invite-only screen, under the signup form and
 * beside the login form: what a plan opens, what it costs, and how to get in.
 *
 * Every feature card comes from PAID_FEATURES (src/lib/legal-mode.ts), the list the proxy
 * enforces, so this page cannot promise something the gate refuses. It used to pitch the
 * DHT index, which legal mode retired.
 *
 * No hooks, so it renders from server and client pages alike. The copy stays inside the
 * standing rule (no piracy pitch): it describes the member's own tools.
 */

import Link from 'next/link';
import {
  Bitcoin,
  Check,
  House,
  LineChart,
  Newspaper,
  PartyPopper,
  Podcast,
  Radio,
  Rss,
  Server,
  Ticket,
  Tv,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PAID_FEATURES, WATCH_PARTY_HOST } from '@/lib/legal-mode';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  'live-tv': Tv,
  seedboxes: Server,
  'go-live': Radio,
  news: Newspaper,
  rss: Rss,
  finance: LineChart,
  'watch-party': PartyPopper,
};

const PLAN_CARDS = [...PAID_FEATURES, WATCH_PARTY_HOST];

const FREE = [
  { icon: Podcast, label: 'Podcasts from any public feed' },
  { icon: Users, label: 'Join watch parties with synced playback and chat' },
  { icon: Ticket, label: '5 invites a month, and 7 Premium days for you and each friend' },
  { icon: House, label: 'Read your own mailboxes in one place' },
];

const PLANS = [
  { name: 'Premium', price: '$4.99', period: 'a year', note: 'Everything below, for one person' },
  { name: 'Family', price: '$9.99', period: 'a year', note: 'Everything below, for up to 10 people' },
];

const STEPS = [
  'A member sends you an invite link or code.',
  'Create your account with it. You start with a 3-day trial of every plan feature.',
  'Keep it for $4.99 a year, or stay on the free account. You get 5 invites of your own every month.',
];

const button = 'inline-flex items-center justify-center rounded-lg px-5 py-3 font-medium transition-colors';

interface InviteLandingProps {
  /** Show the sign-up and sign-in buttons. Off under the signup form, which is the call to action. */
  actions?: boolean;
  className?: string;
}

export function InviteLanding({ actions = true, className }: InviteLandingProps): React.ReactElement {
  return (
    <div className={cn('space-y-12 text-left', className)}>
      <section className="text-center space-y-4">
        <p className="text-sm font-medium uppercase tracking-wider text-accent-primary">One membership, your own tools</p>
        <h2 className="text-3xl sm:text-4xl font-bold leading-tight">Your TV, your seedbox, your stream. $4.99 a year.</h2>
        <p className="mx-auto max-w-xl text-lg text-text-secondary">
          BitTorrented plays your own IPTV playlist, streams from your own seedbox, and puts your camera or screen live
          in one click. No ads on a plan, no card needed, and the first 3 days are free.
        </p>
        {actions ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/signup" className={cn(button, 'bg-accent-primary text-white hover:bg-accent-primary/90')}>
              <Ticket className="mr-2 h-5 w-5" aria-hidden />I have an invite
            </Link>
            <Link
              href="/pricing"
              className={cn(
                button,
                'border border-accent-primary bg-accent-primary/10 text-text-primary hover:bg-accent-primary/20'
              )}
            >
              See plans
            </Link>
            <Link
              href="/login?redirect=%2Ffeatures"
              className={cn(
                button,
                'border border-border-default bg-bg-tertiary text-text-primary hover:border-accent-primary'
              )}
            >
              Sign in
            </Link>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="mb-4 text-center text-lg font-semibold">What a plan opens</h3>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLAN_CARDS.map(({ key, label, blurb }) => {
            const Icon = ICONS[key] ?? Check;
            return (
              <li key={key} className="rounded-xl border border-border-default bg-bg-secondary p-5">
                <Icon className="mb-3 h-7 w-7 text-accent-primary" aria-hidden />
                <h4 className="mb-2 font-semibold">{label}</h4>
                <p className="text-sm text-text-secondary">{blurb}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.name} className="rounded-xl border border-accent-primary/50 bg-accent-primary/5 p-6 text-center">
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1">
              <span className="text-4xl font-bold">{plan.price}</span>{' '}
              <span className="text-text-muted">{plan.period}</span>
            </p>
            <p className="mt-2 text-sm text-text-secondary">{plan.note}</p>
          </div>
        ))}
        <p className="sm:col-span-2 flex items-center justify-center gap-2 text-center text-sm text-text-secondary">
          <Bitcoin className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden />
          Pay with crypto or PayPal. 30-day money-back guarantee.{' '}
          <Link href="/pricing" className="text-accent-primary hover:underline">
            Compare plans
          </Link>
        </p>
      </section>

      <section>
        <h3 className="mb-4 text-center text-lg font-semibold">Free with every account</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FREE.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-text-secondary">
              <Icon className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border-default bg-bg-secondary p-6">
        <h3 className="mb-4 text-lg font-semibold">How to get in</h3>
        <p className="mb-4 text-sm text-text-secondary">
          Accounts are invite only: we are growing it slowly, one member vouching for the next.
        </p>
        <ol className="space-y-2 text-sm">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-xs font-semibold text-accent-primary">
                {i + 1}
              </span>
              <span className="text-text-secondary">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-center text-xs text-text-muted">
        Built for things that are yours to play: your own playlists, your own seedbox, your own camera, public podcasts
        and feeds. See the <Link href="/terms" className="underline">terms</Link>.
      </p>
    </div>
  );
}
