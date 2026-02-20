/**
 * My Library Page (Server Component)
 *
 * Server-side rendered page that fetches user's library data.
 * Data is fetched server-side and passed to client component for interactivity.
 *
 * This ensures:
 * - Static rendering when logged in (no dynamic loading)
 * - All Supabase calls are server-side
 * - Fast initial page load with pre-fetched data
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { getActiveProfileId } from '@/lib/profiles';
import { getLibraryRepository } from '@/lib/library';
import { getFavoritesService } from '@/lib/favorites';
import { getWatchlistRepository } from '@/lib/watchlist';
import { LibraryContent } from './library-content';

/**
 * Force dynamic rendering for authenticated pages
 * This ensures we always check auth status
 */
export const dynamic = 'force-dynamic';

/**
 * Library page metadata
 */
export const metadata = {
  title: 'My Library | BitTorrented',
  description: 'Your favorites, collections, and watch history',
};

export default async function LibraryPage(): Promise<React.ReactElement> {
  // Check authentication server-side
  const user = await getCurrentUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login?redirect=/library');
  }

  const profileId = await getActiveProfileId();
  if (!profileId) {
    redirect('/profiles?redirect=/library');
  }

  // Fetch all library data server-side
  const libraryRepo = getLibraryRepository();
  const favoritesService = getFavoritesService();
  const watchlistRepo = getWatchlistRepository();

  const [favorites, collections, history, torrentFavorites, iptvChannelFavorites, watchlistItems] = await Promise.all([
    libraryRepo.getUserFavorites(profileId).catch(() => []),
    libraryRepo.getUserCollections(profileId).catch(() => []),
    libraryRepo.getCombinedHistory(profileId, 50).catch(() => []),
    favoritesService.getTorrentFavorites(profileId).catch(() => []),
    favoritesService.getIptvChannelFavorites(profileId).catch(() => []),
    watchlistRepo.getAllUserWatchlistItems(profileId).catch(() => []),
  ]);

  return (
    <MainLayout>
      <LibraryContent
        initialFavorites={favorites}
        initialCollections={collections}
        initialHistory={history}
        initialTorrentFavorites={torrentFavorites}
        initialIptvChannelFavorites={iptvChannelFavorites}
        initialWatchlistItems={watchlistItems}
      />
    </MainLayout>
  );
}
