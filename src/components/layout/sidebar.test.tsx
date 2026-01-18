/**
 * Sidebar Navigation Component Tests
 * 
 * Tests for the sidebar navigation including:
 * - Navigation item visibility based on auth state
 * - Watch Party accessibility without login
 * - Mobile menu functionality
 * - Active state highlighting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './sidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

describe('Sidebar Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Navigation Items Visibility', () => {
    it('should render the sidebar', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    it('should show Home link for all users', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    });

    it('should show Search link for all users', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /search/i })).toBeInTheDocument();
    });

    it('should show Torrents link for all users', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /^torrents$/i })).toBeInTheDocument();
    });

    it('should show Live TV link for all users (redirects to login when not logged in)', () => {
      render(<Sidebar isLoggedIn={false} />);

      const link = screen.getByRole('link', { name: /live tv/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/login');
    });

    it('should show Pricing link for all users', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /pricing/i })).toBeInTheDocument();
    });
  });

  describe('Watch Party Accessibility', () => {
    it('should show Watch Party link when user is NOT logged in', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      const watchPartyLink = screen.getByRole('link', { name: /watch party/i });
      expect(watchPartyLink).toBeInTheDocument();
      expect(watchPartyLink).toHaveAttribute('href', '/watch-party');
    });

    it('should show Watch Party link when user IS logged in', () => {
      render(<Sidebar isLoggedIn={true} />);
      
      const watchPartyLink = screen.getByRole('link', { name: /watch party/i });
      expect(watchPartyLink).toBeInTheDocument();
      expect(watchPartyLink).toHaveAttribute('href', '/watch-party');
    });

    it('should have Watch Party accessible without authentication requirement', () => {
      // Render without login
      const { rerender } = render(<Sidebar isLoggedIn={false} />);
      
      // Watch Party should be visible
      expect(screen.getByRole('link', { name: /watch party/i })).toBeInTheDocument();
      
      // Rerender with login
      rerender(<Sidebar isLoggedIn={true} />);
      
      // Watch Party should still be visible
      expect(screen.getByRole('link', { name: /watch party/i })).toBeInTheDocument();
    });
  });

  describe('Auth-Required Items', () => {
    it('should show My Library link when user is NOT logged in but redirect to login', () => {
      render(<Sidebar isLoggedIn={false} />);

      const link = screen.getByRole('link', { name: /my library/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/login');
    });

    it('should show My Library link with correct href when user IS logged in', () => {
      render(<Sidebar isLoggedIn={true} />);

      const link = screen.getByRole('link', { name: /my library/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/library');
    });

    it('should show Settings link when user is NOT logged in but redirect to login', () => {
      render(<Sidebar isLoggedIn={false} />);

      const link = screen.getByRole('link', { name: /settings/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/login');
    });

    it('should show Settings link with correct href when user IS logged in', () => {
      render(<Sidebar isLoggedIn={true} />);

      const link = screen.getByRole('link', { name: /settings/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/settings');
    });

    it('should show Podcasts link when user is NOT logged in but redirect to login', () => {
      render(<Sidebar isLoggedIn={false} />);

      const link = screen.getByRole('link', { name: /podcasts/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/login');
    });

    it('should show Podcasts link with correct href when user IS logged in', () => {
      render(<Sidebar isLoggedIn={true} />);

      const link = screen.getByRole('link', { name: /podcasts/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/podcasts');
    });

    it('should show Live TV link when user is NOT logged in but redirect to login', () => {
      render(<Sidebar isLoggedIn={false} />);

      const link = screen.getByRole('link', { name: /live tv/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/login');
    });

    it('should show Live TV link with correct href when user IS logged in', () => {
      render(<Sidebar isLoggedIn={true} />);

      const link = screen.getByRole('link', { name: /live tv/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/live-tv');
    });
  });

  describe('Navigation Links', () => {
    it('should have correct href for Home', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    });

    it('should have correct href for Search', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('link', { name: /search/i })).toHaveAttribute('href', '/search');
    });

    it('should have correct href for Torrents', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('link', { name: /^torrents$/i })).toHaveAttribute('href', '/torrents');
    });

    it('should have correct href for Find Torrents', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('link', { name: /find torrents/i })).toHaveAttribute('href', '/find-torrents');
    });

    it('should have correct href for Live TV when logged in', () => {
      render(<Sidebar isLoggedIn={true} />);

      expect(screen.getByRole('link', { name: /live tv/i })).toHaveAttribute('href', '/live-tv');
    });

    it('should have correct href for Watch Party', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('link', { name: /watch party/i })).toHaveAttribute('href', '/watch-party');
    });

    it('should have correct href for Pricing', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute('href', '/pricing');
    });
  });

  describe('Mobile Menu', () => {
    it('should render mobile menu button', () => {
      render(<Sidebar />);
      
      expect(screen.getByRole('button', { name: /toggle menu/i })).toBeInTheDocument();
    });

    it('should toggle mobile menu when button clicked', async () => {
      render(<Sidebar />);
      
      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      const sidebar = screen.getByRole('complementary');
      
      // Initially closed on mobile (has -translate-x-full class)
      expect(sidebar).toHaveClass('-translate-x-full');
      
      // Click to open
      await userEvent.click(toggleButton);
      
      // Should now be open (has translate-x-0 class)
      expect(sidebar).toHaveClass('translate-x-0');
    });

    it('should close mobile menu when clicking overlay', async () => {
      render(<Sidebar />);
      
      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      
      // Open the menu
      await userEvent.click(toggleButton);
      
      // Find and click the overlay
      const overlay = document.querySelector('[aria-hidden="true"]');
      expect(overlay).toBeInTheDocument();
      
      if (overlay) {
        fireEvent.click(overlay);
      }
      
      // Menu should be closed
      const sidebar = screen.getByRole('complementary');
      expect(sidebar).toHaveClass('-translate-x-full');
    });

    it('should close mobile menu when nav item clicked', async () => {
      render(<Sidebar />);
      
      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      
      // Open the menu
      await userEvent.click(toggleButton);
      
      // Click a nav item
      await userEvent.click(screen.getByRole('link', { name: /watch party/i }));
      
      // Menu should be closed
      const sidebar = screen.getByRole('complementary');
      expect(sidebar).toHaveClass('-translate-x-full');
    });
  });

  describe('Logo', () => {
    it('should render logo image', () => {
      render(<Sidebar />);
      
      const logo = screen.getByAltText('BitTorrented');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/logo.svg');
    });

    it('should have logo link to home', () => {
      render(<Sidebar />);
      
      const logoLink = screen.getByAltText('BitTorrented').closest('a');
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });

  describe('Account Section', () => {
    it('should always show Account section header', () => {
      render(<Sidebar isLoggedIn={false} />);

      expect(screen.getByText('Account')).toBeInTheDocument();
    });

    it('should show all account items (Pricing and Settings) regardless of auth state', () => {
      render(<Sidebar isLoggedIn={false} />);

      expect(screen.getByRole('link', { name: /pricing/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    });
  });

  describe('Navigation Item Count', () => {
    it('should show all nav items when logged out (all items visible, auth-required redirect to login)', () => {
      render(<Sidebar isLoggedIn={false} />);

      const links = screen.getAllByRole('link');
      // Logo link + 10 main nav items + 2 account items + 4 external sites = 17
      // Home, Search, Trending, My Library, Torrents, Find Torrents, News, Podcasts, Live TV, Watch Party = 10 main
      // Pricing, Settings = 2 account
      // Logo = 1
      // External: The Pirate Bay, LimeTorrents, 1337x, IMDB = 4
      expect(links.length).toBe(17);
    });

    it('should show all nav items when logged in', () => {
      render(<Sidebar isLoggedIn={true} />);

      const links = screen.getAllByRole('link');
      // Logo link + 10 main nav items + 2 account items + 4 external sites = 17
      expect(links.length).toBe(17);
    });
  });

  describe('Free Features Accessibility', () => {
    it('should ensure Watch Party is free (no requiresAuth)', () => {
      // This test verifies the business requirement that Watch Party is free
      render(<Sidebar isLoggedIn={false} />);
      
      // Watch Party should be visible without login
      const watchPartyLink = screen.getByRole('link', { name: /watch party/i });
      expect(watchPartyLink).toBeInTheDocument();
      
      // Verify it's in the main navigation (not hidden)
      expect(watchPartyLink).toBeVisible();
    });

    it('should keep Watch Party visible regardless of auth state changes', { timeout: 15000 }, () => {
      const { rerender } = render(<Sidebar isLoggedIn={false} />);

      // Initially not logged in
      expect(screen.getByRole('link', { name: /watch party/i })).toBeInTheDocument();

      // Log in
      rerender(<Sidebar isLoggedIn={true} />);
      expect(screen.getByRole('link', { name: /watch party/i })).toBeInTheDocument();

      // Log out again
      rerender(<Sidebar isLoggedIn={false} />);
      expect(screen.getByRole('link', { name: /watch party/i })).toBeInTheDocument();
    });
  });

  describe('Torrent Index Sites Footer', () => {
    it('should render Find Magnets section header', () => {
      render(<Sidebar />);
      
      expect(screen.getByText('Find Magnets')).toBeInTheDocument();
    });

    it('should render Media Info section header', () => {
      render(<Sidebar />);
      
      expect(screen.getByText('Media Info')).toBeInTheDocument();
    });

    it('should render LimeTorrents external link', () => {
      render(<Sidebar />);
      
      const link = screen.getByRole('link', { name: /limetorrents/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://www.limetorrents.fun/');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render 1337x external link', () => {
      render(<Sidebar />);
      
      const link = screen.getByRole('link', { name: /1337x/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://x1337x.cc/');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render IMDB external link', () => {
      render(<Sidebar />);
      
      const link = screen.getByRole('link', { name: /imdb/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://www.imdb.com/');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render all 4 external site links', () => {
      render(<Sidebar />);

      const externalLinks = screen.getAllByRole('link').filter(link =>
        link.getAttribute('target') === '_blank'
      );
      expect(externalLinks).toHaveLength(4);
    });

    it('should show external sites regardless of auth state', { timeout: 15000 }, () => {
      const { rerender } = render(<Sidebar isLoggedIn={false} />);

      expect(screen.getByRole('link', { name: /the pirate bay/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /limetorrents/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /1337x/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /imdb/i })).toBeInTheDocument();

      rerender(<Sidebar isLoggedIn={true} />);

      expect(screen.getByRole('link', { name: /the pirate bay/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /limetorrents/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /1337x/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /imdb/i })).toBeInTheDocument();
    });
  });
});
