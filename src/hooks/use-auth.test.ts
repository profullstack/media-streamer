/**
 * useAuth Hook Tests
 * 
 * Tests for client-side auth state hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './use-auth';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with loading true', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      const { result } = renderHook(() => useAuth());
      
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isLoggedIn).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('authenticated user', () => {
    it('should set isLoggedIn to true when user is authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'premium',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoggedIn).toBe(true);
      expect(result.current.user).toEqual(mockUser);
    });

    it('should include subscription tier in user data', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        subscription_tier: 'family',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user?.subscription_tier).toBe('family');
    });
  });

  describe('unauthenticated user', () => {
    it('should set isLoggedIn to false when no user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null }),
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoggedIn).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('should handle 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoggedIn).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoggedIn).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.error).toBe('Network error');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoggedIn).toBe(false);
      expect(result.current.error).toBe('Invalid JSON');
    });
  });

  describe('refresh', () => {
    it('should provide refresh function', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null }),
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('should refetch auth state on refresh', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: { id: 'user-123', email: 'test@example.com' } }),
        });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoggedIn).toBe(false);

      // Trigger refresh
      result.current.refresh();

      await waitFor(() => {
        expect(result.current.isLoggedIn).toBe(true);
      });
    });
  });

  describe('isPremium helper', () => {
    it('should return true for premium users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          user: { id: 'user-123', email: 'test@example.com', subscription_tier: 'premium' } 
        }),
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isPremium).toBe(true);
    });

    it('should return true for family users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          user: { id: 'user-123', email: 'test@example.com', subscription_tier: 'family' } 
        }),
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isPremium).toBe(true);
    });

    it('should return false for free users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          user: { id: 'user-123', email: 'test@example.com', subscription_tier: 'free' } 
        }),
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isPremium).toBe(false);
    });
  });
});
