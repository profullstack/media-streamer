/**
 * Watchlist Page (Server Component)
 *
 * Shows user's watchlists with TMDB movies/TV shows.
 * Requires authentication (redirects to login).
 * Auto-creates default watchlist on first visit.
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { getActiveProfileId } from '@/lib/profiles';
import { getWatchlistRepository } from '@/lib/watchlist';
import { WatchlistContent } from './watchlist-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Watchlist | BitTorrented',
  description: 'Your saved movies and TV shows to watch',
};

export default async function WatchlistPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/watchlist');
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    redirect('/select-profile?redirect=/watchlist');
  }

  const repo = getWatchlistRepository();
  let watchlists = await repo.getUserWatchlists(profileId);

  // Auto-create default watchlist if none exist
  if (watchlists.length === 0) {
    const defaultWatchlist = await repo.getOrCreateDefaultWatchlist(profileId);
    watchlists = [defaultWatchlist];
  }

  // Fetch items for the first watchlist
  const initialItems = watchlists.length > 0
    ? await repo.getWatchlistItems(watchlists[0].id)
    : [];

  return (
    <MainLayout>
      <WatchlistContent
        initialWatchlists={watchlists}
        initialItems={initialItems}
        initialActiveWatchlistId={watchlists[0]?.id ?? null}
      />
    </MainLayout>
  );
}
