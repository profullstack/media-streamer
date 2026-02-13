'use client';

/**
 * Auth Context
 *
 * Provides cached authentication state across the entire app.
 * Fetches auth status once on mount and caches it across route changes,
 * eliminating the per-navigation fetch that blocks rendering on slow devices.
 */

import { createContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  subscription_tier?: 'free' | 'trial' | 'premium' | 'family';
  subscription_expired?: boolean;
  trial_expired?: boolean;
  trial_expires_at?: string;
  subscription_expires_at?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface AuthContextValue {
  isLoading: boolean;
  isLoggedIn: boolean;
  isPremium: boolean;
  isTrialExpired: boolean;
  user: AuthUser | null;
  error: string | null;
  refresh: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * How long cached auth data is considered fresh (ms).
 * During this window, navigations reuse cached data without refetching.
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAt = useRef<number>(0);
  const fetchInFlight = useRef<Promise<void> | null>(null);

  const fetchAuthState = useCallback(async (force = false): Promise<void> => {
    const now = Date.now();

    // If we have cached data and it's still fresh, skip the fetch
    if (!force && lastFetchedAt.current > 0 && now - lastFetchedAt.current < CACHE_TTL_MS) {
      setIsLoading(false);
      return;
    }

    // If a fetch is already in flight, wait for it instead of duplicating
    if (fetchInFlight.current) {
      await fetchInFlight.current;
      return;
    }

    // Only show loading spinner on the very first fetch (no cached data yet)
    if (lastFetchedAt.current === 0) {
      setIsLoading(true);
    }
    setError(null);

    const doFetch = async (): Promise<void> => {
      try {
        const response = await fetch('/api/auth/me');

        if (!response.ok) {
          // Don't cache failed responses — let the next navigation retry
          setUser(null);
          return;
        }

        const data = await response.json() as { user: AuthUser | null };
        setUser(data.user);
        // Only cache successful responses — transient failures shouldn't
        // lock the user out for the full cache TTL
        lastFetchedAt.current = Date.now();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setUser(null);
      } finally {
        setIsLoading(false);
        fetchInFlight.current = null;
      }
    };

    fetchInFlight.current = doFetch();
    await fetchInFlight.current;
  }, []);

  useEffect(() => {
    void fetchAuthState();
  }, [fetchAuthState]);

  const refresh = useCallback(() => {
    lastFetchedAt.current = 0; // force refetch
    void fetchAuthState(true);
  }, [fetchAuthState]);

  const isLoggedIn = user !== null;
  const isPremium =
    (user?.subscription_tier === 'trial' ||
    user?.subscription_tier === 'premium' ||
    user?.subscription_tier === 'family') &&
    user?.subscription_expired !== true;
  const isTrialExpired = user?.trial_expired === true;

  return (
    <AuthContext.Provider
      value={{ isLoading, isLoggedIn, isPremium, isTrialExpired, user, error, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}
