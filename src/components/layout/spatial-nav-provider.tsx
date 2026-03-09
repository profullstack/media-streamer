'use client';

/**
 * Spatial Navigation Provider
 *
 * Initializes @noriginmedia/norigin-spatial-navigation for TV/remote/keyboard
 * navigation. Works on all platforms:
 * - TV: D-pad / remote arrow keys + OK/Enter
 * - Desktop: arrow keys + Enter (optional, doesn't break mouse/tab)
 * - Mobile: touch works as normal, spatial nav is passive
 */

import { useEffect } from 'react';
import { init } from '@noriginmedia/norigin-spatial-navigation';
import { useTvDetection } from '@/hooks';

interface SpatialNavProviderProps {
  children: React.ReactNode;
}

let initialized = false;

export function SpatialNavProvider({ children }: SpatialNavProviderProps): React.ReactElement {
  const { isTv } = useTvDetection();

  useEffect(() => {
    if (initialized) return;

    init({
      debug: false,
      shouldFocusDOMNode: true,
      throttle: 100,
    });

    initialized = true;

    if (process.env.NODE_ENV === 'development') {
      console.log('[SpatialNav] Initialized', { isTv });
    }
  }, [isTv]);

  return <>{children}</>;
}
