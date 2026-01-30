/**
 * Auth Context Tests
 *
 * Tests for the AuthProvider that caches auth state across navigations.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AuthProvider, AuthContext } from './auth-context';
import { useContext } from 'react';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to consume context in tests
function TestConsumer(): React.ReactElement {
  const ctx = useContext(AuthContext);
  return (
    <div>
      <div data-testid="is-loading">{ctx?.isLoading ? 'true' : 'false'}</div>
      <div data-testid="is-logged-in">{ctx?.isLoggedIn ? 'true' : 'false'}</div>
      <div data-testid="is-premium">{ctx?.isPremium ? 'true' : 'false'}</div>
      <div data-testid="user-email">{ctx?.user?.email ?? 'none'}</div>
      <div data-testid="user-tier">{ctx?.user?.subscription_tier ?? 'none'}</div>
      <div data-testid="error">{ctx?.error ?? 'none'}</div>
      <button data-testid="refresh" onClick={() => ctx?.refresh()}>Refresh</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial state', () => {
    it('should start with isLoading true', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithProvider();

      expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false');
      expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    });

    it('should provide null context when used without provider', () => {
      const { result } = renderHook(() => useContext(AuthContext));
      expect(result.current).toBeNull();
    });
  });

  describe('Authenticated user', () => {
    it('should set user data when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'premium' as const,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true');
      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('user-tier')).toHaveTextContent('premium');
    });

    it('should set isLoggedIn false when user is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false');
      expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    });

    it('should handle non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false');
    });
  });

  describe('isPremium', () => {
    it.each([
      ['premium', true],
      ['family', true],
      ['trial', true],
      ['free', false],
    ])('should return %s for tier "%s"', async (tier, expected) => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-1', email: 'test@example.com', subscription_tier: tier },
        }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('is-premium')).toHaveTextContent(String(expected));
    });

    it('should return false when no user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('is-premium')).toHaveTextContent('false');
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false');
    });

    it('should handle non-Error thrown values', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('error')).toHaveTextContent('Unknown error');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('error')).toHaveTextContent('Invalid JSON');
    });
  });

  describe('Caching behavior', () => {
    it('should only fetch once on mount', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: 'u1', email: 'a@b.com' } }),
      });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/me');
    });

    it('should share auth state between multiple consumers', async () => {
      const mockUser = { id: 'u1', email: 'shared@example.com' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      function SecondConsumer(): React.ReactElement {
        const ctx = useContext(AuthContext);
        return <div data-testid="second-email">{ctx?.user?.email ?? 'none'}</div>;
      }

      render(
        <AuthProvider>
          <TestConsumer />
          <SecondConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      // Both consumers see the same data from a single fetch
      expect(screen.getByTestId('user-email')).toHaveTextContent('shared@example.com');
      expect(screen.getByTestId('second-email')).toHaveTextContent('shared@example.com');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Refresh', () => {
    it('should refetch auth state on refresh', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: { id: 'u1', email: 'new@example.com' } }),
        });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false');

      // Trigger refresh
      await act(async () => {
        screen.getByTestId('refresh').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent('new@example.com');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should clear error on refresh', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: { id: 'u1', email: 'recovered@example.com' } }),
        });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Network error');
      });

      // Trigger refresh
      await act(async () => {
        screen.getByTestId('refresh').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('none');
      });

      expect(screen.getByTestId('user-email')).toHaveTextContent('recovered@example.com');
    });
  });

  describe('Renders children', () => {
    it('should render children immediately', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthProvider>
          <div data-testid="child">Hello</div>
        </AuthProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });
  });
});
