'use client';

/**
 * CrawlProof ad units — shown ONLY to logged-out visitors.
 *
 * The ad.js loader (added globally in the root layout) scans the DOM once on
 * load and does NOT watch for mutations. Our slots are auth-gated, so they
 * appear well after that initial scan has already run. We therefore call the
 * loader's `window.crawlproofAds.scan()` hook once this slot mounts (retrying
 * briefly in case ad.js — loaded `afterInteractive` — isn't ready yet).
 *
 * Manage the slot at https://crawlproof.com/ads/slots
 */

import { useEffect } from 'react';
import { useAuth } from '@/hooks';

const CRAWLPROOF_SLOT = 'aa961cc7-96e6-4f77-b065-e962cd7bce6f';

type AdFormat = 'banner_300x250' | 'banner_728x90' | 'banner_320x50' | 'text_link';

declare global {
  interface Window {
    crawlproofAds?: { scan: () => void };
  }
}

interface AdUnitProps {
  format: AdFormat;
  className?: string;
}

/**
 * A single ad slot. Renders nothing while auth is resolving or for logged-in
 * users; renders the `data-cp-ad` div (which ad.js fills) for logged-out ones.
 */
export function AdUnit({ format, className }: AdUnitProps): React.ReactElement | null {
  const { isLoading, isLoggedIn } = useAuth();
  const shouldRender = !isLoading && !isLoggedIn;

  useEffect(() => {
    if (!shouldRender) return;
    return requestScan();
  }, [shouldRender]);

  if (!shouldRender) return null;

  return (
    <div className={className} aria-hidden="true">
      <div data-cp-ad="" data-slot={CRAWLPROOF_SLOT} data-format={format} />
    </div>
  );
}

/** Ask ad.js to scan again; it loads `afterInteractive`, so poll briefly until it is there. */
function requestScan(): () => void {
  let tries = 0;
  let timer: ReturnType<typeof setTimeout>;
  const trigger = (): void => {
    if (window.crawlproofAds?.scan) {
      window.crawlproofAds.scan();
      return;
    }
    // ad.js loads `afterInteractive`; poll briefly until it's available.
    if (tries++ < 20) {
      timer = setTimeout(trigger, 250);
    }
  };
  trigger();
  return () => clearTimeout(timer);
}

/**
 * The low-profile unit for list pages: the fluid 40px text_link line (it
 * carries its own "Sponsored" mark). One per page, never on the homepage.
 */
export function AdBanner({ className }: { className?: string }): React.ReactElement | null {
  return <AdUnit format="text_link" className={`w-full ${className ?? ''}`.trim()} />;
}

/**
 * The same low-profile text_link line for detail/article pages (kept as its own
 * export so call sites read by placement).
 */
export function AdRectangle({ className }: { className?: string }): React.ReactElement | null {
  return <AdUnit format="text_link" className={`w-full ${className ?? 'my-2'}`.trim()} />;
}
