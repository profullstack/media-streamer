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
      
      expect(screen.getByRole('link', { name: /torrents/i })).toBeInTheDocument();
    });

    it('should show Live TV link for all users', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /live tv/i })).toBeInTheDocument();
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
    it('should hide My Library link when user is NOT logged in', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      expect(screen.queryByRole('link', { name: /my library/i })).not.toBeInTheDocument();
    });

    it('should show My Library link when user IS logged in', () => {
      render(<Sidebar isLoggedIn={true} />);
      
      expect(screen.getByRole('link', { name: /my library/i })).toBeInTheDocument();
    });

    it('should hide Settings link when user is NOT logged in', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    });

    it('should show Settings link when user IS logged in', () => {
      render(<Sidebar isLoggedIn={true} />);
      
      expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
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
      
      expect(screen.getByRole('link', { name: /torrents/i })).toHaveAttribute('href', '/torrents');
    });

    it('should have correct href for Live TV', () => {
      render(<Sidebar />);
      
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
    it('should show Account section header when logged in', () => {
      render(<Sidebar isLoggedIn={true} />);
      
      expect(screen.getByText('Account')).toBeInTheDocument();
    });

    it('should show Account section when there are visible account items', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      // Pricing is always visible, so Account section should show
      expect(screen.getByText('Account')).toBeInTheDocument();
    });
  });

  describe('Navigation Item Count', () => {
    it('should show 6 main nav items when logged out (Home, Search, Torrents, Live TV, Watch Party, Pricing)', () => {
      render(<Sidebar isLoggedIn={false} />);
      
      const links = screen.getAllByRole('link');
      // Logo link + 5 main nav items + 1 account item (Pricing)
      // Home, Search, Torrents, Live TV, Watch Party = 5 main
      // Pricing = 1 account
      // Logo = 1
      expect(links.length).toBe(7);
    });

    it('should show 8 nav items when logged in (adds My Library and Settings)', () => {
      render(<Sidebar isLoggedIn={true} />);
      
      const links = screen.getAllByRole('link');
      // Logo link + 6 main nav items + 2 account items
      // Home, Search, My Library, Torrents, Live TV, Watch Party = 6 main
      // Pricing, Settings = 2 account
      // Logo = 1
      expect(links.length).toBe(9);
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

    it('should keep Watch Party visible regardless of auth state changes', () => {
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
});
