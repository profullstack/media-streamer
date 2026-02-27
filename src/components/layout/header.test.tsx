/**
 * Header Component Tests
 * 
 * Tests for the header including:
 * - Search functionality
 * - Category dropdown
 * - User dropdown with email display
 * - Switch profile and account settings links
 * - Logout functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './header';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

describe('Header Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render the header', () => {
      render(<Header />);
      
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<Header />);
      
      expect(screen.getByPlaceholderText(/search torrents/i)).toBeInTheDocument();
    });

    it('should render category dropdown button', () => {
      render(<Header />);
      
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    });
  });

  describe('Logged Out State', () => {
    it('should show Log In link when not logged in', () => {
      render(<Header isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
    });

    it('should show Sign Up link when not logged in', () => {
      render(<Header isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
    });

    it('should have correct href for Log In', () => {
      render(<Header isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
    });

    it('should have correct href for Sign Up', () => {
      render(<Header isLoggedIn={false} />);
      
      expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup');
    });

    it('should not show user dropdown when not logged in', () => {
      render(<Header isLoggedIn={false} />);
      
      expect(screen.queryByTestId('user-dropdown-trigger')).not.toBeInTheDocument();
    });
  });

  describe('Logged In State - User Dropdown', () => {
    const userEmail = 'test@example.com';

    it('should show user dropdown trigger when logged in', () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      expect(screen.getByTestId('user-dropdown-trigger')).toBeInTheDocument();
    });

    it('should display user email in dropdown trigger', () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      expect(screen.getByText(userEmail)).toBeInTheDocument();
    });

    it('should not show Log In link when logged in', () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument();
    });

    it('should not show Sign Up link when logged in', () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      expect(screen.queryByRole('link', { name: /sign up/i })).not.toBeInTheDocument();
    });

    it('should open dropdown menu when trigger is clicked', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      expect(screen.getByTestId('user-dropdown-menu')).toBeInTheDocument();
    });

    it('should show Switch Profile link in dropdown', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      expect(screen.getByRole('link', { name: /switch profile/i })).toBeInTheDocument();
    });

    it('should have correct href for Switch Profile', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      expect(screen.getByRole('link', { name: /switch profile/i })).toHaveAttribute('href', '/select-profile?switch=1');
    });

    it('should show Account Settings link in dropdown', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      expect(screen.getByRole('link', { name: /account settings/i })).toBeInTheDocument();
    });

    it('should have correct href for Account Settings', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      expect(screen.getByRole('link', { name: /account settings/i })).toHaveAttribute('href', '/account');
    });

    it('should show Log Out button in dropdown', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    });

    it('should close dropdown when clicking outside', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      expect(screen.getByTestId('user-dropdown-menu')).toBeInTheDocument();
      
      // Click outside (on the backdrop)
      const backdrop = document.querySelector('[data-testid="user-dropdown-backdrop"]');
      if (backdrop) {
        fireEvent.click(backdrop);
      }
      
      expect(screen.queryByTestId('user-dropdown-menu')).not.toBeInTheDocument();
    });

    it('should close dropdown when Switch Profile is clicked', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      const switchProfileLink = screen.getByRole('link', { name: /switch profile/i });
      await userEvent.click(switchProfileLink);
      
      expect(screen.queryByTestId('user-dropdown-menu')).not.toBeInTheDocument();
    });

    it('should close dropdown when Account Settings is clicked', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      const accountLink = screen.getByRole('link', { name: /account settings/i });
      await userEvent.click(accountLink);
      
      expect(screen.queryByTestId('user-dropdown-menu')).not.toBeInTheDocument();
    });

    it('should display truncated email for long addresses', () => {
      const longEmail = 'verylongemailaddress@verylongdomain.example.com';
      render(<Header isLoggedIn={true} userEmail={longEmail} />);
      
      // The email should be displayed (truncation is handled by CSS)
      expect(screen.getByText(longEmail)).toBeInTheDocument();
    });

    it('should show user icon in dropdown trigger', () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      expect(trigger.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Logout Functionality', () => {
    const userEmail = 'test@example.com';
    const mockOnLogout = vi.fn();

    it('should call onLogout when Log Out is clicked', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} onLogout={mockOnLogout} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      const logoutButton = screen.getByRole('button', { name: /log out/i });
      await userEvent.click(logoutButton);
      
      expect(mockOnLogout).toHaveBeenCalledTimes(1);
    });

    it('should close dropdown after logout', async () => {
      render(<Header isLoggedIn={true} userEmail={userEmail} onLogout={mockOnLogout} />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      await userEvent.click(trigger);
      
      const logoutButton = screen.getByRole('button', { name: /log out/i });
      await userEvent.click(logoutButton);
      
      expect(screen.queryByTestId('user-dropdown-menu')).not.toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should update search query on input', async () => {
      render(<Header />);
      
      const searchInput = screen.getByPlaceholderText(/search torrents/i);
      await userEvent.type(searchInput, 'test query');
      
      expect(searchInput).toHaveValue('test query');
    });

    it('should navigate to search page on form submit', async () => {
      render(<Header />);
      
      const searchInput = screen.getByPlaceholderText(/search torrents/i);
      await userEvent.type(searchInput, 'test query');
      
      const form = searchInput.closest('form');
      if (form) {
        fireEvent.submit(form);
      }
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/search?q=test+query');
      });
    });

    it('should include category in search URL when selected', async () => {
      render(<Header />);
      
      // Open category dropdown
      const categoryButton = screen.getByRole('button', { name: /all/i });
      await userEvent.click(categoryButton);
      
      // Select Music category
      const musicOption = screen.getByRole('button', { name: /music/i });
      await userEvent.click(musicOption);
      
      // Type search query
      const searchInput = screen.getByPlaceholderText(/search torrents/i);
      await userEvent.type(searchInput, 'test');
      
      const form = searchInput.closest('form');
      if (form) {
        fireEvent.submit(form);
      }
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/search?q=test&type=audio');
      });
    });

    it('should not submit empty search', async () => {
      render(<Header />);
      
      const searchInput = screen.getByPlaceholderText(/search torrents/i);
      const form = searchInput.closest('form');
      if (form) {
        fireEvent.submit(form);
      }
      
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Category Dropdown', () => {
    it('should open category dropdown when clicked', async () => {
      render(<Header />);
      
      const categoryButton = screen.getByRole('button', { name: /all/i });
      await userEvent.click(categoryButton);
      
      expect(screen.getByRole('button', { name: /music/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /movies & tv/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /books/i })).toBeInTheDocument();
    });

    it('should close category dropdown when option selected', async () => {
      render(<Header />);
      
      const categoryButton = screen.getByRole('button', { name: /all/i });
      await userEvent.click(categoryButton);
      
      const musicOption = screen.getByRole('button', { name: /music/i });
      await userEvent.click(musicOption);
      
      // Dropdown should be closed
      expect(screen.queryByRole('button', { name: /movies & tv/i })).not.toBeInTheDocument();
    });

    it('should update button text when category selected', async () => {
      render(<Header />);
      
      const categoryButton = screen.getByRole('button', { name: /all/i });
      await userEvent.click(categoryButton);
      
      const musicOption = screen.getByRole('button', { name: /music/i });
      await userEvent.click(musicOption);
      
      // Button should now show "Music"
      expect(screen.getByRole('button', { name: /music/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible search input', () => {
      render(<Header />);
      
      const searchInput = screen.getByPlaceholderText(/search torrents/i);
      expect(searchInput).toHaveAttribute('type', 'search');
    });

    it('should have accessible submit button', () => {
      render(<Header />);
      
      const submitButton = screen.getByRole('button', { name: /search/i });
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    it('should have proper aria-label on user dropdown trigger', () => {
      render(<Header isLoggedIn={true} userEmail="test@example.com" />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      expect(trigger).toHaveAttribute('aria-label', 'User menu');
    });

    it('should have proper aria-expanded on user dropdown trigger', async () => {
      render(<Header isLoggedIn={true} userEmail="test@example.com" />);
      
      const trigger = screen.getByTestId('user-dropdown-trigger');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      
      await userEvent.click(trigger);
      
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
