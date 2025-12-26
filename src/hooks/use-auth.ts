'use client';

/**
 * useAuth Hook
 * 
 * Client-side hook for checking authentication state.
 * Fetches auth status from server API to maintain server-side Supabase rule.
 */

import { useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  subscription_tier?: 'free' | 'premium' | 'family';
  display_name?: string;
  avatar_url?: string;
}

export interface UseAuthResult {
  isLoading: boolean;
  isLoggedIn: boolean;
  isPremium: boolean;
  user: AuthUser | null;
  error: string | null;
  refresh: () => void;
}

export function useAuth(): UseAuthResult {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAuthState = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/me');
      
      if (!response.ok) {
        setUser(null);
        return;
      }

      const data = await response.json() as { user: AuthUser | null };
      setUser(data.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAuthState();
  }, [fetchAuthState]);

  const isLoggedIn = user !== null;
  const isPremium = user?.subscription_tier === 'premium' || user?.subscription_tier === 'family';

  return {
    isLoading,
    isLoggedIn,
    isPremium,
    user,
    error,
    refresh: fetchAuthState,
  };
}
