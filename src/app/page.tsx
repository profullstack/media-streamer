/**
 * Home Page
 * 
 * Main landing page showing recent activity and quick actions.
 */

import { MainLayout } from '@/components/layout';
import { MusicIcon, VideoIcon, BookIcon, MagnetIcon, SearchIcon, TvIcon } from '@/components/ui/icons';
import Link from 'next/link';

export default function HomePage(): React.ReactElement {
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
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            href="/torrents"
            icon={MagnetIcon}
            title="Add Torrent"
            description="Add a magnet link to start streaming"
            color="accent-primary"
          />
          <QuickActionCard
            href="/search"
            icon={SearchIcon}
            title="Search"
            description="Search across all your media"
            color="accent-secondary"
          />
          <QuickActionCard
            href="/music"
            icon={MusicIcon}
            title="Music"
            description="Browse your music collection"
            color="accent-audio"
          />
          <QuickActionCard
            href="/videos"
            icon={VideoIcon}
            title="Videos"
            description="Watch movies and shows"
            color="accent-video"
          />
        </section>

        {/* Media Categories */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-text-primary">Browse by Category</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <CategoryCard
              href="/movies"
              icon={VideoIcon}
              title="Movies"
              count={0}
              color="accent-video"
            />
            <CategoryCard
              href="/tvshows"
              icon={TvIcon}
              title="TV Shows"
              count={0}
              color="accent-video"
            />
            <CategoryCard
              href="/music"
              icon={MusicIcon}
              title="Music"
              count={0}
              color="accent-audio"
            />
            <CategoryCard
              href="/books"
              icon={BookIcon}
              title="Books"
              count={0}
              color="accent-ebook"
            />
            <CategoryCard
              href="/videos"
              icon={VideoIcon}
              title="All Videos"
              count={0}
              color="accent-secondary"
            />
            <CategoryCard
              href="/live-tv"
              icon={TvIcon}
              title="Live TV"
              count={0}
              color="accent-primary"
            />
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

interface QuickActionCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  description: string;
  color: string;
}

function QuickActionCard({
  href,
  icon: Icon,
  title,
  description,
  color,
}: QuickActionCardProps): React.ReactElement {
  return (
    <Link
      href={href}
      className="card-hover flex flex-col items-center p-6 text-center transition-transform hover:scale-[1.02]"
    >
      <div className={`mb-3 rounded-full bg-${color}/20 p-3`}>
        <Icon className={`text-${color}`} size={24} />
      </div>
      <h3 className="font-medium text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
    </Link>
  );
}

interface CategoryCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  count: number;
  color: string;
}

function CategoryCard({
  href,
  icon: Icon,
  title,
  count,
  color,
}: CategoryCardProps): React.ReactElement {
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
        <p className="text-sm text-text-muted">{count} files</p>
      </div>
    </Link>
  );
}
