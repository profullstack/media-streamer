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
import { getLibraryRepository } from '@/lib/library';
import { getFavoritesService } from '@/lib/favorites';
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

  // Fetch all library data server-side
  const libraryRepo = getLibraryRepository();
  const favoritesService = getFavoritesService();

  const [favorites, collections, history, torrentFavorites, iptvChannelFavorites] = await Promise.all([
    libraryRepo.getUserFavorites(user.id).catch(() => []),
    libraryRepo.getUserCollections(user.id).catch(() => []),
    libraryRepo.getCombinedHistory(user.id, 50).catch(() => []),
    favoritesService.getTorrentFavorites(user.id).catch(() => []),
    favoritesService.getIptvChannelFavorites(user.id).catch(() => []),
  ]);

  return (
    <MainLayout>
      <LibraryContent
        initialFavorites={favorites}
        initialCollections={collections}
        initialHistory={history}
        initialTorrentFavorites={torrentFavorites}
        initialIptvChannelFavorites={iptvChannelFavorites}
      />
    </MainLayout>
  );
}
