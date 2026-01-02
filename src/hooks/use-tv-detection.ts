'use client';

/**
 * TV Detection Hook
 *
 * Detects TV browsers (Amazon Silk, Fire TV, Android TV, Samsung Tizen, LG WebOS, etc.)
 * to apply TV-specific layouts and styling.
 *
 * TV browsers like Amazon Silk apply aggressive zoom/scaling that cannot be overridden
 * via CSS or viewport meta tags. The solution is to detect these browsers and serve
 * a TV-optimized layout with smaller fonts and fixed widths.
 */

import { useState, useEffect } from 'react';

/**
 * TV browser types that can be detected
 */
export type TvBrowserType =
  | 'silk'      // Amazon Silk browser
  | 'firetv'    // Amazon Fire TV
  | 'androidtv' // Android TV
  | 'googletv'  // Google TV
  | 'tizen'     // Samsung Smart TV (Tizen OS)
  | 'webos'     // LG Smart TV (WebOS)
  | 'roku'      // Roku TV
  | 'appletv'   // Apple TV
  | 'chromecast' // Chromecast
  | 'smarttv'   // Generic Smart TV
  | null;

/**
 * Result of TV detection
 */
export interface TvDetectionResult {
  /** Whether the current browser is a TV browser */
  isTv: boolean;
  /** Whether detection is still in progress (SSR) */
  isLoading: boolean;
  /** The specific TV browser type detected, or null if not a TV */
  browserType: TvBrowserType;
}

/**
 * TV browser detection patterns
 * Order matters - more specific patterns should come first
 */
const TV_PATTERNS: Array<{ pattern: RegExp; type: TvBrowserType }> = [
  // Amazon Fire TV devices (AFT prefix in model)
  { pattern: /\bAFT[A-Z0-9]+\b/i, type: 'firetv' },
  // Amazon Kindle Fire devices (KF prefix)
  { pattern: /\bKF[A-Z]+\b/, type: 'silk' },
  // Amazon Silk browser
  { pattern: /\bSilk\b/i, type: 'silk' },
  // Android TV
  { pattern: /\bAndroid TV\b/i, type: 'androidtv' },
  // Google TV
  { pattern: /\bGoogleTV\b/i, type: 'googletv' },
  // Samsung Tizen TV
  { pattern: /\bTizen\b/i, type: 'tizen' },
  // LG WebOS TV
  { pattern: /\bWeb0S\b/i, type: 'webos' },
  // Roku
  { pattern: /\bRoku\b/i, type: 'roku' },
  // Apple TV (can appear as AppleTV or just the model number like AppleTV11,1)
  { pattern: /AppleTV/i, type: 'appletv' },
  // Chromecast
  { pattern: /\bCrKey\b/i, type: 'chromecast' },
  // Generic Smart TV indicators
  { pattern: /\bSMART-TV\b/i, type: 'smarttv' },
  { pattern: /\bSmartTV\b/i, type: 'smarttv' },
];

/**
 * Check if a user agent string indicates a TV browser
 *
 * @param userAgent - The user agent string to check
 * @returns true if the user agent indicates a TV browser
 */
export function isTvBrowser(userAgent: string): boolean {
  if (!userAgent) {
    return false;
  }

  return TV_PATTERNS.some(({ pattern }) => pattern.test(userAgent));
}

/**
 * Get the specific TV browser type from a user agent string
 *
 * @param userAgent - The user agent string to check
 * @returns The TV browser type, or null if not a TV browser
 */
export function getTvBrowserType(userAgent: string): TvBrowserType {
  if (!userAgent) {
    return null;
  }

  for (const { pattern, type } of TV_PATTERNS) {
    if (pattern.test(userAgent)) {
      return type;
    }
  }

  return null;
}

/**
 * Hook to detect if the current browser is a TV browser
 *
 * @returns TvDetectionResult with isTv, isLoading, and browserType
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isTv, isLoading, browserType } = useTvDetection();
 *
 *   if (isLoading) {
 *     return <div>Loading...</div>;
 *   }
 *
 *   return (
 *     <div className={isTv ? 'tv-layout' : 'standard-layout'}>
 *       {isTv && <p>Detected TV: {browserType}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTvDetection(): TvDetectionResult {
  const [result, setResult] = useState<TvDetectionResult>({
    isTv: false,
    isLoading: true,
    browserType: null,
  });

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') {
      return;
    }

    const userAgent = navigator.userAgent;
    const browserType = getTvBrowserType(userAgent);

    setResult({
      isTv: browserType !== null,
      isLoading: false,
      browserType,
    });
  }, []);

  return result;
}

/**
 * Server-side TV detection from request headers
 *
 * @param userAgent - The user agent string from request headers
 * @returns TvDetectionResult (isLoading is always false for server-side)
 */
export function detectTvFromUserAgent(userAgent: string | null | undefined): TvDetectionResult {
  if (!userAgent) {
    return {
      isTv: false,
      isLoading: false,
      browserType: null,
    };
  }

  const browserType = getTvBrowserType(userAgent);

  return {
    isTv: browserType !== null,
    isLoading: false,
    browserType,
  };
}
