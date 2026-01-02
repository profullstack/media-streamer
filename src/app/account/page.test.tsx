/**
 * Account Settings Page Tests
 *
 * Tests for the account settings page including:
 * - Page rendering
 * - User information display
 * - Navigation tabs
 * - Settings sections
 * - Subscription management (upgrade, downgrade, cancel)
 * - Billing history display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock IntersectionObserver (required by Next.js Link component)
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  root = null;
  rootMargin = '';
  thresholds = [];
  takeRecords = vi.fn().mockReturnValue([]);
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

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
    // Default mock for fetch - returns empty data
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/subscription') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            tier: 'free',
            status: 'active',
            expiresAt: null,
            isActive: true,
            daysRemaining: null,
          }),
        });
      }
      if (url === '/api/subscription/history') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ payments: [], total: 0 }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    it('should show current plan for free users', async () => {
      render(<AccountPage />);
      
      const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
      await userEvent.click(subscriptionTab);
      
      await waitFor(() => {
        expect(screen.getByText(/free plan/i)).toBeInTheDocument();
      });
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

  describe('Subscription Management', () => {
    describe('Trial Users', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          isLoggedIn: true,
          isLoading: false,
          user: {
            id: 'user-123',
            email: 'trial@example.com',
            subscription_tier: 'trial',
          },
        });
        mockFetch.mockImplementation((url: string) => {
          if (url === '/api/subscription') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                tier: 'trial',
                status: 'active',
                expiresAt: '2026-02-01T00:00:00Z',
                isActive: true,
                daysRemaining: 30,
              }),
            });
          }
          if (url === '/api/subscription/history') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ payments: [], total: 0 }),
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
      });

      it('should show upgrade options for trial users', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText(/upgrade your plan/i)).toBeInTheDocument();
        });
      });

      it('should show trial badge', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText('Trial')).toBeInTheDocument();
        });
      });
    });

    describe('Premium Users', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          isLoggedIn: true,
          isLoading: false,
          user: {
            id: 'user-123',
            email: 'premium@example.com',
            subscription_tier: 'premium',
          },
        });
        mockFetch.mockImplementation((url: string) => {
          if (url === '/api/subscription') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                tier: 'premium',
                status: 'active',
                expiresAt: '2027-01-01T00:00:00Z',
                isActive: true,
                daysRemaining: 365,
              }),
            });
          }
          if (url === '/api/subscription/history') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                payments: [
                  {
                    id: 'payment-1',
                    plan: 'premium',
                    amountUsd: 99.99,
                    status: 'confirmed',
                    createdAt: '2026-01-01T00:00:00Z',
                  },
                ],
                total: 1,
              }),
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
      });

      it('should show upgrade to family option', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText(/family/i)).toBeInTheDocument();
        });
      });

      it('should show cancel subscription button', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument();
        });
      });

      it('should show payment history', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText(/billing history/i)).toBeInTheDocument();
          expect(screen.getByText(/\$99\.99/)).toBeInTheDocument();
        });
      });
    });

    describe('Family Users', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          isLoggedIn: true,
          isLoading: false,
          user: {
            id: 'user-123',
            email: 'family@example.com',
            subscription_tier: 'family',
          },
        });
        mockFetch.mockImplementation((url: string) => {
          if (url === '/api/subscription') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                tier: 'family',
                status: 'active',
                expiresAt: '2027-01-01T00:00:00Z',
                isActive: true,
                daysRemaining: 365,
              }),
            });
          }
          if (url === '/api/subscription/history') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ payments: [], total: 0 }),
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
      });

      it('should show downgrade to premium option', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText(/downgrade plan/i)).toBeInTheDocument();
        });
      });

      it('should show family features', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText(/up to 5 family members/i)).toBeInTheDocument();
        });
      });
    });

    describe('Cancel Subscription Flow', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          isLoggedIn: true,
          isLoading: false,
          user: {
            id: 'user-123',
            email: 'premium@example.com',
            subscription_tier: 'premium',
          },
        });
        mockFetch.mockImplementation((url: string, options?: RequestInit) => {
          if (url === '/api/subscription') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                tier: 'premium',
                status: 'active',
                expiresAt: '2027-01-01T00:00:00Z',
                isActive: true,
                daysRemaining: 365,
              }),
            });
          }
          if (url === '/api/subscription/history') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ payments: [], total: 0 }),
            });
          }
          if (url === '/api/subscription/manage' && options?.method === 'DELETE') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                success: true,
                message: 'Subscription cancelled successfully',
              }),
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
      });

      it('should show confirmation dialog when cancel is clicked', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument();
        });
        
        const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });
        await userEvent.click(cancelButton);
        
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /yes, cancel/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /keep subscription/i })).toBeInTheDocument();
      });

      it('should hide confirmation when keep subscription is clicked', async () => {
        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument();
        });
        
        const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });
        await userEvent.click(cancelButton);
        
        const keepButton = screen.getByRole('button', { name: /keep subscription/i });
        await userEvent.click(keepButton);
        
        expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
      });
    });

    describe('Billing History', () => {
      it('should show empty state when no payments', async () => {
        mockUseAuth.mockReturnValue({
          isLoggedIn: true,
          isLoading: false,
          user: {
            id: 'user-123',
            email: 'trial@example.com',
            subscription_tier: 'trial',
          },
        });
        mockFetch.mockImplementation((url: string) => {
          if (url === '/api/subscription') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                tier: 'trial',
                status: 'active',
                expiresAt: null,
                isActive: true,
                daysRemaining: null,
              }),
            });
          }
          if (url === '/api/subscription/history') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ payments: [], total: 0 }),
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText(/no payment history yet/i)).toBeInTheDocument();
        });
      });

      it('should show error when billing history fails to load', async () => {
        mockUseAuth.mockReturnValue({
          isLoggedIn: true,
          isLoading: false,
          user: {
            id: 'user-123',
            email: 'premium@example.com',
            subscription_tier: 'premium',
          },
        });
        mockFetch.mockImplementation((url: string) => {
          if (url === '/api/subscription') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                tier: 'premium',
                status: 'active',
                expiresAt: '2027-01-01T00:00:00Z',
                isActive: true,
                daysRemaining: 365,
              }),
            });
          }
          if (url === '/api/subscription/history') {
            return Promise.resolve({
              ok: false,
              status: 500,
            });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(<AccountPage />);
        
        const subscriptionTab = screen.getByRole('button', { name: 'Subscription' });
        await userEvent.click(subscriptionTab);
        
        await waitFor(() => {
          expect(screen.getByText(/failed to fetch payment history/i)).toBeInTheDocument();
        });
      });
    });
  });
});
