'use client';

/**
 * useAuth Hook
 *
 * Client-side hook for checking authentication state.
 * Reads from the shared AuthContext (populated once at app root)
 * so that route changes reuse cached auth data instead of refetching.
 */

import { useContext } from 'react';
import { AuthContext } from '@/contexts/auth-context';
import type { AuthContextValue, AuthUser } from '@/contexts/auth-context';

export type { AuthUser };

export type UseAuthResult = AuthContextValue;

export function useAuth(): UseAuthResult {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return ctx;
}
