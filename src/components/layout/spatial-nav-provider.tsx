'use client';

/**
 * Spatial Navigation Provider
 *
 * Initializes @noriginmedia/norigin-spatial-navigation for TV/remote/keyboard
 * navigation. Works on all platforms:
 * - TV: D-pad / remote arrow keys + OK/Enter (including Fire Stick Silk)
 * - Desktop: arrow keys + Enter
 * - Mobile: touch works as normal, spatial nav is passive
 *
 * Fire Stick remote key codes:
 * - D-pad: ArrowUp/Down/Left/Right (standard)
 * - Select/OK: Enter (standard)
 * - Back: Backspace or key 4 (Android KEYCODE_BACK)
 * - Menu: key 82 (Android KEYCODE_MENU)
 */

import { useEffect, useCallback } from 'react';
import { init, setFocus } from '@noriginmedia/norigin-spatial-navigation';
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
      // Show focus visuals in debug on TV
      debug: false,
      // Focus the actual DOM node so screen readers and Silk can track it
      shouldFocusDOMNode: true,
      // Throttle rapid key repeats from holding D-pad
      throttle: 150,
    });

    initialized = true;

    // On TV, set initial focus after a short delay to let the page render
    if (isTv) {
      setTimeout(() => {
        try {
          setFocus('SN:FOCUSED');
        } catch {
          // No focusable elements yet, that's fine
        }
      }, 500);
    }

    console.log('[SpatialNav] Initialized', { isTv });
  }, [isTv]);

  // Handle Fire Stick back button (goes to browser back)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Fire Stick back button sends Backspace or key code 4
    if (e.key === 'Backspace' || e.keyCode === 4) {
      // Don't prevent default in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      
      e.preventDefault();
      window.history.back();
    }

    // Fire Stick menu button (key code 82) — could toggle sidebar
    if (e.keyCode === 82 && isTv) {
      e.preventDefault();
      // Future: toggle sidebar/menu
    }
  }, [isTv]);

  useEffect(() => {
    if (!isTv) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTv, handleKeyDown]);

  return <>{children}</>;
}
