/**
 * Account Settings Page Tests
 * 
 * Tests for the account settings page including:
 * - Page rendering
 * - User information display
 * - Navigation tabs
 * - Settings sections
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the MainLayout component
vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));

// Mock the useAuth hook
const mockUseAuth = vi.fn();
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Import after mocks
import AccountPage from './page';

describe('Account Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isLoggedIn: true,
      isLoading: false,
      user: {
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'free',
      },
    });
  });

  describe('Page Rendering', () => {
    it('should render the account settings page', () => {
      render(<AccountPage />);
      
      expect(screen.getByText('Account Settings')).toBeInTheDocument();
    });

    it('should render within MainLayout', () => {
      render(<AccountPage />);
      
      expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    });

    it('should display user email', () => {
      render(<AccountPage />);
      
      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should display subscription tier', () => {
      render(<AccountPage />);
      
      expect(screen.getByText(/free plan/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner when auth is loading', () => {
      mockUseAuth.mockReturnValue({
        isLoggedIn: false,
        isLoading: true,
        user: null,
      });

      render(<AccountPage />);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Unauthenticated State', () => {
    it('should redirect to login when not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        isLoggedIn: false,
        isLoading: false,
        user: null,
      });

      render(<AccountPage />);
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Navigation Tabs', () => {
    it('should render Account tab', () => {
      render(<AccountPage />);
      
      // Use exact match to avoid matching "Delete Account"
      expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    });

    it('should render Subscription tab', () => {
      render(<AccountPage />);
      
      expect(screen.getByRole('button', { name: 'Subscription' })).toBeInTheDocument();
    });

    it('should render Security tab', () => {
      render(<AccountPage />);
      
      expect(screen.getByRole('button', { name: 'Security' })).toBeInTheDocument();
    });

    it('should switch to Subscription tab when clicked', async () => {
      render(<AccountPage />);
      
      const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
      await userEvent.click(subscriptionTab);
      
      expect(screen.getByText(/current plan/i)).toBeInTheDocument();
    });

    it('should switch to Security tab when clicked', async () => {
      render(<AccountPage />);
      
      const securityTab = screen.getByRole('button', { name: 'Security' });
      await userEvent.click(securityTab);
      
      expect(screen.getByText(/change password/i)).toBeInTheDocument();
    });
  });

  describe('Account Section', () => {
    it('should display email field', () => {
      render(<AccountPage />);
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    it('should show email as disabled (read-only)', () => {
      render(<AccountPage />);
      
      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toBeDisabled();
    });
  });

  describe('Subscription Section', () => {
    it('should show upgrade link for free users', async () => {
      render(<AccountPage />);
      
      const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
      await userEvent.click(subscriptionTab);
      
      expect(screen.getByRole('link', { name: /upgrade/i })).toBeInTheDocument();
    });

    it('should show premium badge for premium users', async () => {
      mockUseAuth.mockReturnValue({
        isLoggedIn: true,
        isLoading: false,
        user: {
          id: 'user-123',
          email: 'premium@example.com',
          subscription_tier: 'premium',
        },
      });

      render(<AccountPage />);
      
      const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
      await userEvent.click(subscriptionTab);
      
      // Check for the Premium badge specifically
      expect(screen.getByText('Premium')).toBeInTheDocument();
    });
  });

  describe('Security Section', () => {
    it('should show change password button', async () => {
      render(<AccountPage />);
      
      const securityTab = screen.getByRole('button', { name: 'Security' });
      await userEvent.click(securityTab);
      
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });
  });

  describe('Danger Zone', () => {
    it('should show delete account button', () => {
      render(<AccountPage />);
      
      expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
    });
  });
});
