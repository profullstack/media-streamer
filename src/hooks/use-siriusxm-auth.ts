'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SiriusXmAuthStatus {
  connected: boolean;
  email?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
}

export interface UseSiriusXmAuthResult {
  status: SiriusXmAuthStatus | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSiriusXmAuth(): UseSiriusXmAuthResult {
  const [status, setStatus] = useState<SiriusXmAuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/radio/auth/status', { credentials: 'include' });
      if (res.status === 401) {
        setStatus({ connected: false });
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = (await res.json()) as SiriusXmAuthStatus;
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return { status, isLoading, error, refetch: fetchStatus };
}
