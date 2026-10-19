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

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks';
import { AD_NETWORK_CODE, AD_NETWORK_SLOT } from '@/lib/ad-network';

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
 * The ad.network 300×250 for the logged-out homepage (/invite-only).
 *
 * Unlike AdUnit it does not wait for auth: it is server-rendered, so the unit is in
 * the page's raw HTML where ad.network looks for it. The page drops it (`show`
 * false) once it knows the visitor is a member. Zero height until ad.js fills it.
 */
export function AdNetworkRectangle({ show = true, className }: { show?: boolean; className?: string }): React.ReactElement | null {
  useEffect(() => {
    if (!show) return;
    return requestScan();
  }, [show]);

  if (!show) return null;

  return (
    <div className={`flex justify-center ${className ?? ''}`.trim()}>
      <aside
        data-ad-network={AD_NETWORK_CODE}
        data-cp-ad=""
        data-slot={AD_NETWORK_SLOT}
        data-format="banner_300x250"
        aria-label="Advertisement"
        className="h-0 overflow-hidden data-[cp-filled]:h-auto data-[cp-filled]:min-h-[266px]"
      />
    </div>
  );
}

/**
 * Responsive banner for list pages: a 728×90 leaderboard on tablet/desktop,
 * a 320×50 mobile banner on small screens. Format is picked once at mount to
 * avoid requesting a hidden second slot.
 */
export function AdBanner({ className }: { className?: string }): React.ReactElement | null {
  const [format, setFormat] = useState<AdFormat | null>(null);

  useEffect(() => {
    setFormat(window.matchMedia('(min-width: 640px)').matches ? 'banner_728x90' : 'banner_320x50');
  }, []);

  if (!format) return null;
  return <AdUnit format={format} className={`flex justify-center ${className ?? ''}`.trim()} />;
}

/**
 * 300×250 medium rectangle for detail/article pages. Fits mobile and desktop.
 */
export function AdRectangle({ className }: { className?: string }): React.ReactElement | null {
  return <AdUnit format="banner_300x250" className={`flex justify-center ${className ?? ''}`.trim()} />;
}
