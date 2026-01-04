/**
 * useSupportedCoins Hook
 *
 * React hook for fetching supported cryptocurrencies from the server.
 * This hook calls the server-side API route which securely fetches
 * the supported coins from CoinPayPortal.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupportedCoin } from '@/lib/coinpayportal/types';

interface SupportedCoinsResponse {
  success: boolean;
  coins: SupportedCoin[];
  business_id: string;
  total: number;
}

interface SupportedCoinsErrorResponse {
  success: false;
  error: string;
}

interface UseSupportedCoinsOptions {
  /**
   * If true, only return active coins (default: true)
   */
  activeOnly?: boolean;
}

interface UseSupportedCoinsResult {
  /**
   * List of supported coins
   */
  coins: SupportedCoin[];
  /**
   * Loading state
   */
  isLoading: boolean;
  /**
   * Error message if fetch failed
   */
  error: string | null;
  /**
   * Refetch the supported coins
   */
  refetch: () => void;
}

export function useSupportedCoins(
  options: UseSupportedCoinsOptions = {}
): UseSupportedCoinsResult {
  const { activeOnly = true } = options;

  const [coins, setCoins] = useState<SupportedCoin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCoins = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/supported-coins?active_only=${activeOnly}`
      );

      const data = (await response.json()) as
        | SupportedCoinsResponse
        | SupportedCoinsErrorResponse;

      if (!response.ok || !data.success) {
        const errorData = data as SupportedCoinsErrorResponse;
        throw new Error(errorData.error || 'Failed to fetch supported coins');
      }

      const successData = data as SupportedCoinsResponse;
      setCoins(successData.coins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch supported coins');
      setCoins([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchCoins();
  }, [fetchCoins]);

  return {
    coins,
    isLoading,
    error,
    refetch: fetchCoins,
  };
}
