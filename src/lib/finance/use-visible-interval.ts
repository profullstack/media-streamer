'use client';

/**
 * Finance — run a callback on an interval, but only while the tab is visible.
 *
 * Used to poll quote endpoints for near-live numbers without burning requests
 * (or the shared upstream cache) when the page is backgrounded. Fires once
 * immediately on (re)becoming visible so a returning user sees fresh data.
 */

import { useEffect, useRef } from 'react';

export function useVisibleInterval(callback: () => void, intervalMs: number, enabled = true): void {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0 || typeof document === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = (): void => {
      if (document.visibilityState === 'visible') ref.current();
    };
    const start = (): void => {
      if (timer === null) timer = setInterval(tick, intervalMs);
    };
    const stop = (): void => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        ref.current();
        start();
      } else {
        stop();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
