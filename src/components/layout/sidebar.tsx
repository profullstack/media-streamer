'use client';

/**
 * Sidebar Navigation Component
 *
 * Main navigation sidebar for the application.
 * Supports mobile responsive design with collapsible menu.
 * Shows all features to non-logged-in users but redirects to login for auth-required items.
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  HomeIcon,
  SearchIcon,
  MagnetIcon,
  TvIcon,
  PartyIcon,
  SettingsIcon,
  MenuIcon,
  CloseIcon,
  CreditCardIcon,
  LibraryIcon,
  ExternalLinkIcon,
  TrendingIcon,
  PodcastIcon,
  SearchPlusIcon,
  NewsIcon,
  RadioIcon,
  HeartIcon,
  MovieIcon,
  GlobeIcon,
} from '@/components/ui/icons';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  badge?: string;
  requiresAuth?: boolean;
  requiresPaid?: boolean;
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/search', label: 'Search', icon: SearchIcon },
  { href: '/find-torrents', label: 'Find Torrents', icon: SearchPlusIcon },
  { href: '/dht', label: 'The DHT', icon: GlobeIcon },
  { href: '/trending', label: 'Trending', icon: TrendingIcon },
  { href: '/library', label: 'My Library', icon: LibraryIcon, requiresAuth: true },
  { href: '/watchlist', label: 'Watchlist', icon: HeartIcon, requiresAuth: true },
  { href: '/upcoming', label: 'Upcoming', icon: MovieIcon, requiresPaid: true },
  { href: '/torrents', label: 'Torrents', icon: MagnetIcon },
  { href: '/news', label: 'News', icon: NewsIcon, requiresPaid: true },
  { href: '/podcasts', label: 'Podcasts', icon: PodcastIcon, requiresAuth: true },
  { href: '/live-tv', label: 'Live TV', icon: TvIcon, requiresAuth: true },
  { href: '/radio', label: 'Live Radio', icon: RadioIcon, requiresAuth: true },
  { href: '/watch-party', label: 'Watch Party', icon: PartyIcon },
];

const accountNavItems: NavItem[] = [
  { href: '/pricing', label: 'Pricing', icon: CreditCardIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, requiresAuth: true },
];

interface ExternalSite {
  url: string;
  label: string;
}

const torrentIndexSites: ExternalSite[] = [
  { url: 'https://thepiratebay.org/', label: 'The Pirate Bay' },
  { url: 'https://www.limetorrents.fun/', label: 'LimeTorrents' },
  { url: 'https://x1337x.cc/', label: '1337x' },
];

const mediaInfoSites: ExternalSite[] = [
  { url: 'https://www.imdb.com/', label: 'IMDB' },
];

interface SidebarProps {
  className?: string;
  isLoggedIn?: boolean;
  isPremium?: boolean;
}

export function Sidebar({ className, isLoggedIn = false, isPremium = false }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleMobile = (): void => {
    setIsMobileOpen(!isMobileOpen);
  };

  const closeMobile = (): void => {
    setIsMobileOpen(false);
  };

  // Show all nav items - auth/paid redirects handled in NavSection

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={toggleMobile}
        className="fixed left-4 top-4 z-50 rounded-lg bg-bg-secondary p-2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary md:hidden"
        aria-label="Toggle menu"
      >
        {isMobileOpen ? <CloseIcon size={24} /> : <MenuIcon size={24} />}
      </button>

      {/* Mobile overlay */}
      {isMobileOpen ? <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        /> : null}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-full w-64 transform bg-bg-secondary transition-transform duration-200 ease-in-out',
          'md:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
          className
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-20 items-center px-3">
            <Link href="/" className="flex items-center" onClick={closeMobile}>
              <Image
                src="/logo.svg"
                alt="BitTorrented"
                width={256}
                height={64}
                className="w-64 h-auto"
                style={{ margin: '0.8rem' }}
                priority
              />
            </Link>
          </div>

          {/* Navigation - all content scrolls together */}
          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
            {/* Main Navigation */}
            <div>
              <NavSection items={mainNavItems} pathname={pathname} onItemClick={closeMobile} isLoggedIn={isLoggedIn} isPremium={isPremium} />
            </div>

            {/* Account */}
            <div>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Account
              </h3>
              <NavSection items={accountNavItems} pathname={pathname} onItemClick={closeMobile} isLoggedIn={isLoggedIn} isPremium={isPremium} />
            </div>

            {/* External Links - Find Magnets */}
            <div>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Find Magnets
              </h3>
              <ul className="space-y-1">
                {torrentIndexSites.map((site) => (
                  <li key={site.url}>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      <ExternalLinkIcon size={16} />
                      <span>{site.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* External Links - Media Info */}
            <div>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Media Info
              </h3>
              <ul className="space-y-1">
                {mediaInfoSites.map((site) => (
                  <li key={site.url}>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      <ExternalLinkIcon size={16} />
                      <span>{site.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}

interface NavSectionProps {
  items: NavItem[];
  pathname: string;
  onItemClick: () => void;
  isLoggedIn: boolean;
  isPremium: boolean;
}

function NavSection({ items, pathname, onItemClick, isLoggedIn, isPremium }: NavSectionProps): React.ReactElement {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        // Redirect to login if auth-required and not logged in, or paid feature and not premium
        const needsLogin = (item.requiresAuth && !isLoggedIn) || (item.requiresPaid && !isPremium);
        const href = needsLogin ? '/login' : item.href;

        return (
          <li key={item.href}>
            <Link
              href={href}
              onClick={onItemClick}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              )}
            >
              <Icon size={20} className={isActive ? 'text-accent-primary' : ''} />
              <span>{item.label}</span>
              {item.badge ? <span className="ml-auto rounded-full bg-accent-primary px-2 py-0.5 text-xs font-medium text-white">
                  {item.badge}
                </span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
