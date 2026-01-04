/**
 * useSupportedCoins Hook Tests
 *
 * Tests for the supported coins React hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSupportedCoins } from './use-supported-coins';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useSupportedCoins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should start with loading state', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useSupportedCoins());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.coins).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should fetch and return supported coins', async () => {
    const mockCoins = [
      { symbol: 'BTC', name: 'Bitcoin', is_active: true, has_wallet: true },
      { symbol: 'ETH', name: 'Ethereum', is_active: true, has_wallet: true },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        coins: mockCoins,
        business_id: 'test-business-id',
        total: 2,
      }),
    });

    const { result } = renderHook(() => useSupportedCoins());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.coins).toEqual(mockCoins);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('/api/supported-coins?active_only=true');
  });

  it('should filter active coins by default', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        coins: [],
        business_id: 'test-business-id',
        total: 0,
      }),
    });

    renderHook(() => useSupportedCoins());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/supported-coins?active_only=true');
    });
  });

  it('should allow fetching all coins when activeOnly is false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        coins: [],
        business_id: 'test-business-id',
        total: 0,
      }),
    });

    renderHook(() => useSupportedCoins({ activeOnly: false }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/supported-coins?active_only=false');
    });
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({
        success: false,
        error: 'Failed to fetch supported coins',
      }),
    });

    const { result } = renderHook(() => useSupportedCoins());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.coins).toEqual([]);
    expect(result.current.error).toBe('Failed to fetch supported coins');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSupportedCoins());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.coins).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('should provide refetch function', async () => {
    const mockCoins1 = [
      { symbol: 'BTC', name: 'Bitcoin', is_active: true, has_wallet: true },
    ];
    const mockCoins2 = [
      { symbol: 'BTC', name: 'Bitcoin', is_active: true, has_wallet: true },
      { symbol: 'ETH', name: 'Ethereum', is_active: true, has_wallet: true },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          coins: mockCoins1,
          business_id: 'test-business-id',
          total: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          coins: mockCoins2,
          business_id: 'test-business-id',
          total: 2,
        }),
      });

    const { result } = renderHook(() => useSupportedCoins());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.coins).toEqual(mockCoins1);

    // Refetch
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.coins).toEqual(mockCoins2);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should handle empty coins list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        coins: [],
        business_id: 'test-business-id',
        total: 0,
      }),
    });

    const { result } = renderHook(() => useSupportedCoins());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.coins).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
