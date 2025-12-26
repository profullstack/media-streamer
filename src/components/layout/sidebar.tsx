'use client';

/**
 * Sidebar Navigation Component
 * 
 * Main navigation sidebar for the application.
 * Supports mobile responsive design with collapsible menu.
 */

import { useState } from 'react';
import Link from 'next/link';
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
} from '@/components/ui/icons';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  badge?: string;
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/search', label: 'Search', icon: SearchIcon },
  { href: '/library', label: 'My Library', icon: LibraryIcon },
  { href: '/torrents', label: 'Torrents', icon: MagnetIcon },
  { href: '/live-tv', label: 'Live TV', icon: TvIcon },
  { href: '/watch-party', label: 'Watch Party', icon: PartyIcon },
];

const accountNavItems: NavItem[] = [
  { href: '/pricing', label: 'Pricing', icon: CreditCardIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleMobile = (): void => {
    setIsMobileOpen(!isMobileOpen);
  };

  const closeMobile = (): void => {
    setIsMobileOpen(false);
  };

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
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

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
          <div className="flex h-16 items-center px-6">
            <Link href="/" className="flex items-center gap-2" onClick={closeMobile}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-accent">
                <MagnetIcon className="text-white" size={18} />
              </div>
              <span className="text-lg font-semibold text-text-primary">BitTorrented</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
            {/* Main Navigation */}
            <div>
              <NavSection items={mainNavItems} pathname={pathname} onItemClick={closeMobile} />
            </div>

            {/* Account */}
            <div>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Account
              </h3>
              <NavSection items={accountNavItems} pathname={pathname} onItemClick={closeMobile} />
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
}

function NavSection({ items, pathname, onItemClick }: NavSectionProps): React.ReactElement {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
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
              {item.badge && (
                <span className="ml-auto rounded-full bg-accent-primary px-2 py-0.5 text-xs font-medium text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
