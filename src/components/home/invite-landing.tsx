/**
 * What BitTorrented is, for someone who has never seen it.
 *
 * Anthony, 2026-10-06: someone got an invite and asked what it was for, and he had to
 * explain it is more than a tracker: the DHT, streaming, and seedboxes. This says that up
 * front, on the invite-only screen (signed out) and under the signup form, so an invite
 * link explains itself.
 *
 * No hooks, so it renders from server and client pages alike. The copy stays inside the
 * standing rule (no piracy pitch): it describes the tools and says what they are for.
 */

import Link from 'next/link';
import { Bitcoin, BookOpen, CirclePlay, House, Network, Podcast, Server, Ticket, Tv, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const PILLARS = [
  {
    icon: Network,
    title: 'Straight from the DHT',
    body: 'No tracker in the middle. BitTorrented talks to the BitTorrent DHT directly, so a magnet link or an info hash is all it needs to find peers and read what is inside a torrent.',
  },
  {
    icon: CirclePlay,
    title: 'Stream, don’t wait',
    body: 'Press play on a video, an album or an ebook while it is still arriving. Seeking, subtitles, picture in picture and resume across devices, all in the browser with no client to install.',
  },
  {
    icon: Server,
    title: 'Seedboxes that do the work',
    body: 'Hand a torrent to a seedbox and it downloads and seeds on a fast server, not your laptop. Stream the finished files from anywhere and keep your ratio healthy while you sleep.',
  },
];

const EXTRAS = [
  { icon: Users, label: 'Watch parties with synced playback and chat' },
  { icon: Podcast, label: 'Podcasts from any public feed' },
  { icon: BookOpen, label: 'Ebook reader for PDF and EPUB' },
  { icon: Tv, label: 'Install it as an app, or cast to the TV' },
  { icon: House, label: 'Family profiles on one membership' },
  { icon: Bitcoin, label: 'Pay in crypto, no card needed' },
];

const STEPS = [
  'A member sends you an invite link or code.',
  'Create your account with it. The code is checked when you sign up.',
  'You get 5 invites of your own every month, and unused ones carry over.',
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
        <p className="text-sm font-medium uppercase tracking-wider text-accent-primary">More than a tracker</p>
        <h2 className="text-3xl sm:text-4xl font-bold leading-tight">BitTorrent, finished.</h2>
        <p className="mx-auto max-w-xl text-lg text-text-secondary">
          BitTorrented puts the whole torrent workflow in your browser: find it on the DHT, stream it the second it
          starts, and let a seedbox handle the rest.
        </p>
        {actions ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/signup" className={cn(button, 'bg-accent-primary text-white hover:bg-accent-primary/90')}>
              <Ticket className="mr-2 h-5 w-5" aria-hidden />I have an invite
            </Link>
            <Link
              href="/login?redirect=%2Finvite-only"
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

      <section className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border-default bg-bg-secondary p-5">
            <Icon className="mb-3 h-7 w-7 text-accent-primary" aria-hidden />
            <h3 className="mb-2 font-semibold">{title}</h3>
            <p className="text-sm text-text-secondary">{body}</p>
          </div>
        ))}
      </section>

      <section>
        <h3 className="mb-4 text-center text-lg font-semibold">Also in the box</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EXTRAS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-text-secondary">
              <Icon className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border-default bg-bg-secondary p-6">
        <h3 className="mb-4 text-lg font-semibold">Why invite only?</h3>
        <p className="mb-4 text-sm text-text-secondary">
          We are growing it slowly, one member vouching for the next, while we open features back up one at a time.
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
        Built for things you are allowed to share: Linux ISOs, open courseware, Creative Commons media, public podcasts
        and your own files. See the <Link href="/terms" className="underline">terms</Link>.
      </p>
    </div>
  );
}
