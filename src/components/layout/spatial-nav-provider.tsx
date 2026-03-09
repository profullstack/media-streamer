'use client';

/**
 * Spatial Navigation Provider
 *
 * Initializes @noriginmedia/norigin-spatial-navigation for TV/remote/keyboard
 * navigation. Works on all platforms including Fire Stick Silk browser.
 *
 * Key insight: Silk browser intercepts D-pad for its cursor mode.
 * We capture keydown events at the document level and preventDefault()
 * to disable Silk's cursor, letting the spatial nav library handle focus.
 *
 * Fire Stick remote key codes (from Amazon docs):
 * - D-pad Up: 38 (ArrowUp)
 * - D-pad Down: 40 (ArrowDown)
 * - D-pad Left: 37 (ArrowLeft)
 * - D-pad Right: 39 (ArrowRight)
 * - Select/OK: 13 (Enter)
 * - Back: 4
 * - Play/Pause: 179
 * - Rewind: 227
 * - Fast Forward: 228
 */

import { useEffect, useCallback } from 'react';
import { init, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useTvDetection } from '@/hooks';

interface SpatialNavProviderProps {
  children: React.ReactNode;
}

let initialized = false;

// D-pad + Select key codes that Silk intercepts for cursor mode
const TV_NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
const TV_NAV_KEYCODES = new Set([37, 38, 39, 40, 13]);

export function SpatialNavProvider({ children }: SpatialNavProviderProps): React.ReactElement {
  const { isTv, browserType } = useTvDetection();

  useEffect(() => {
    if (initialized) return;

    init({
      debug: false,
      // Focus the actual DOM node — critical for Silk to track focused element
      shouldFocusDOMNode: true,
      // Throttle rapid key repeats from holding D-pad
      throttle: 150,
    });

    initialized = true;
    console.log('[SpatialNav] Initialized', { isTv, browserType });
  }, [isTv, browserType]);

  // On TV, set initial focus after page renders
  useEffect(() => {
    if (!isTv) return;

    const timer = setTimeout(() => {
      try {
        setFocus('SN:FOCUSED');
      } catch {
        // No focusable elements yet
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isTv]);

  // Intercept D-pad events on TV to prevent Silk's cursor mode from consuming them
  // This is the key to making spatial nav work on Silk — we capture at the document
  // level in the capture phase, before Silk can intercept for cursor movement.
  const handleKeyCapture = useCallback((e: KeyboardEvent) => {
    if (!isTv) return;

    // Don't intercept in input fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    // Intercept D-pad and Select to prevent Silk cursor mode
    if (TV_NAV_KEYS.has(e.key) || TV_NAV_KEYCODES.has(e.keyCode)) {
      // preventDefault stops Silk from moving its cursor
      // The spatial nav library will still receive the event and handle focus
      e.preventDefault();
      // Don't stopPropagation — let the event bubble to norigin-spatial-navigation
    }

    // Back button — navigate browser history
    if (e.key === 'Backspace' || e.keyCode === 4) {
      e.preventDefault();
      window.history.back();
    }
  }, [isTv]);

  useEffect(() => {
    if (!isTv) return;

    // Use capture phase to intercept BEFORE Silk processes the event
    document.addEventListener('keydown', handleKeyCapture, true);
    return () => document.removeEventListener('keydown', handleKeyCapture, true);
  }, [isTv, handleKeyCapture]);

  return <>{children}</>;
}
