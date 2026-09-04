'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpotifyPlayerStatus } from '@/lib/spotify/librespot';

export interface SpotifyStatus extends SpotifyPlayerStatus {
  connected: boolean;
  username: string | null;
  streamUrl: string;
}

export interface UseSpotifyStatusResult {
  status: SpotifyStatus | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** Poll faster while something is in flight, slower once the device is idle. */
function pollDelay(status: SpotifyStatus | null): number {
  if (!status) return 3_000;
  switch (status.state) {
    case 'pairing':
    case 'connecting':
      return 1_500;
    case 'playing':
      return 3_000;
    default:
      return 5_000;
  }
}

export function useSpotifyStatus(): UseSpotifyStatusResult {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Fetch once; resolves with the status so the poller can pick its next delay. */
  const fetchStatus = useCallback(async (): Promise<SpotifyStatus | null> => {
    setError(null);
    try {
      const res = await fetch('/api/spotify/status', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as SpotifyStatus;
      setStatus(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refetch = useCallback(async (): Promise<void> => {
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const latest = await fetchStatus();
      if (cancelled) return;
      timer.current = setTimeout(() => void tick(), pollDelay(latest));
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetchStatus]);

  return { status, isLoading, error, refetch };
}
