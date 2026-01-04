/**
 * Home Page
 *
 * Main landing page showing recent activity and quick actions.
 * Server component that fetches category counts from the database.
 */

import { MainLayout } from '@/components/layout';
import { MusicIcon, VideoIcon, BookIcon, TvIcon, HeartIcon } from '@/components/ui/icons';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { QuickActions } from '@/components/home';

/**
 * Check if user has an active paid subscription (premium or family)
 * Returns false if not logged in or on trial
 */
async function hasActivePaidSubscription(): Promise<boolean> {
  try {
    // Get the current user from the session cookie
    const user = await getCurrentUser();
    
    if (!user) {
      return false;
    }
    
    const supabase = createServerClient();
    
    // Check subscription status
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('tier, status, subscription_expires_at')
      .eq('user_id', user.id)
      .single();
    
    if (!subscription) {
      return false;
    }
    
    // Only premium and family tiers with active status can see XXX
    if (subscription.tier !== 'premium' && subscription.tier !== 'family') {
      return false;
    }
    
    if (subscription.status !== 'active') {
      return false;
    }
    
    // Check if subscription hasn't expired
    if (subscription.subscription_expires_at) {
      const expiresAt = new Date(subscription.subscription_expires_at);
      if (expiresAt < new Date()) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch category counts from the database
 */
async function getCategoryCounts(includexxx: boolean): Promise<{
  movies: number;
  tvshows: number;
  music: number;
  books: number;
  xxx: number;
  liveTv: number;
  total: number;
}> {
  try {
    const supabase = createServerClient();
    
    // Get current user from session cookie for IPTV playlist count
    const user = await getCurrentUser();
    
    // Fetch counts for each content type
    const queries = [
      supabase.from('torrents').select('id', { count: 'exact', head: true }).eq('content_type', 'movie'),
      supabase.from('torrents').select('id', { count: 'exact', head: true }).eq('content_type', 'tvshow'),
      supabase.from('torrents').select('id', { count: 'exact', head: true }).eq('content_type', 'music'),
      supabase.from('torrents').select('id', { count: 'exact', head: true }).eq('content_type', 'book'),
      supabase.from('torrents').select('id', { count: 'exact', head: true }),
    ];
    
    // Only fetch XXX count if user has access
    if (includexxx) {
      queries.push(
        supabase.from('torrents').select('id', { count: 'exact', head: true }).eq('content_type', 'xxx')
      );
    }
    
    const results = await Promise.all(queries);
    const [moviesResult, tvshowsResult, musicResult, booksResult, totalResult] = results;
    const xxxResult = includexxx ? results[5] : null;
    
    // Fetch IPTV playlist count for the user (all playlists, not just active)
    let liveTvCount = 0;
    if (user) {
      const { count: playlistCount, error: playlistError } = await supabase
        .from('iptv_playlists')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      
      if (playlistError) {
        console.error('[Home] Error fetching IPTV playlist count:', playlistError);
      }
      
      liveTvCount = playlistCount ?? 0;
    }

    return {
      movies: moviesResult.count ?? 0,
      tvshows: tvshowsResult.count ?? 0,
      music: musicResult.count ?? 0,
      books: booksResult.count ?? 0,
      xxx: xxxResult?.count ?? 0,
      liveTv: liveTvCount,
      total: totalResult.count ?? 0,
    };
  } catch (error) {
    console.error('Failed to fetch category counts:', error);
    return { movies: 0, tvshows: 0, music: 0, books: 0, xxx: 0, liveTv: 0, total: 0 };
  }
}

export default async function HomePage(): Promise<React.ReactElement> {
  // Check if user has paid subscription for XXX access
  const canAccessXxx = await hasActivePaidSubscription();
  const counts = await getCategoryCounts(canAccessXxx);
  
  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <section className="text-center">
          <h1 className="text-3xl font-bold text-text-primary md:text-4xl">
            Welcome to <span className="gradient-text">BitTorrented</span>
          </h1>
          <p className="mt-2 text-text-secondary">
            Stream music, movies, books, and live TV from torrents and IPTV
          </p>
        </section>

        {/* Quick Actions */}
        <QuickActions />

        {/* Media Categories */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-text-primary">Browse by Category</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <CategoryCard
              href="/movies"
              icon={VideoIcon}
              title="Movies"
              count={counts.movies}
              color="accent-video"
            />
            <CategoryCard
              href="/tvshows"
              icon={TvIcon}
              title="TV Shows"
              count={counts.tvshows}
              color="accent-video"
            />
            <CategoryCard
              href="/music"
              icon={MusicIcon}
              title="Music"
              count={counts.music}
              color="accent-audio"
            />
            <CategoryCard
              href="/books"
              icon={BookIcon}
              title="Books"
              count={counts.books}
              color="accent-ebook"
            />
            <CategoryCard
              href="/live-tv"
              icon={TvIcon}
              title="Live TV"
              count={counts.liveTv}
              color="accent-primary"
              label="provider"
            />
            {/* XXX category - only visible to paid subscribers */}
            {canAccessXxx && (
              <CategoryCard
                href="/xxx"
                icon={HeartIcon}
                title="XXX"
                count={counts.xxx}
                color="accent-primary"
              />
            )}
          </div>
        </section>

        {/* Getting Started */}
        <section className="card p-6">
          <h2 className="mb-4 text-xl font-semibold text-text-primary">Getting Started</h2>
          <ol className="space-y-3 text-text-secondary">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary text-sm font-medium text-white">
                1
              </span>
              <span>Add a magnet link from your favorite torrent site</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary text-sm font-medium text-white">
                2
              </span>
              <span>Wait for the metadata to be indexed (no download required)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary text-sm font-medium text-white">
                3
              </span>
              <span>Search and stream any file directly in your browser</span>
            </li>
          </ol>
        </section>
      </div>
    </MainLayout>
  );
}

interface CategoryCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  count: number;
  color: string;
  label?: string;
}

function CategoryCard({
  href,
  icon: Icon,
  title,
  count,
  color,
  label = 'torrent',
}: CategoryCardProps): React.ReactElement {
  const pluralLabel = label === 'torrent' ? 'torrents' : `${label}s`;
  return (
    <Link
      href={href}
      className="card-hover flex items-center gap-4 p-4 transition-transform hover:scale-[1.02]"
    >
      <div className={`rounded-lg bg-${color}/20 p-3`}>
        <Icon className={`text-${color}`} size={24} />
      </div>
      <div>
        <h3 className="font-medium text-text-primary">{title}</h3>
        <p className="text-sm text-text-muted">{count} {count === 1 ? label : pluralLabel}</p>
      </div>
    </Link>
  );
}
