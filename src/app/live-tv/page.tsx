/**
 * Live TV Page (Server Component)
 *
 * Shows login prompt if not authenticated, otherwise shows Live TV content.
 */

import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { LiveTvContent } from './live-tv-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Live TV | BitTorrented',
  description: 'Stream live channels from your IPTV playlists',
};

export default async function LiveTvPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
        <h1 className="text-2xl font-bold text-text-primary">Login Required</h1>
        <p className="text-text-secondary max-w-md">
          You need to be logged in to access Live TV. Sign in to stream live channels from your IPTV playlists.
        </p>
        <Link
          href="/login?redirect=/live-tv"
          className="rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return <LiveTvContent />;
}
