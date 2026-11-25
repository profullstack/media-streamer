'use client';

/**
 * CrawlProof ad units, shown to anyone without a plan (see useShowsAds).
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
 * Who sees ads: anyone without a plan. That is a signed-out visitor and a member on
 * the free account (Anthony, 2026-11-25: "free tier shows crawlproof.com/ads ... make it
 * tasteful"). A plan, a running trial and an admin see none: no ads is part of what a
 * plan buys. Nothing renders while auth is still resolving, so a member with a plan
 * never sees a unit flash in and out.
 */
export function useShowsAds(): boolean {
  const { isLoading, isPremium, user } = useAuth();
  return !isLoading && !isPremium && user?.is_admin !== true;
}

/**
 * A single ad slot: the `data-cp-ad` div (which ad.js fills) for anyone without a plan,
 * nothing for everybody else.
 */
export function AdUnit({ format, className }: AdUnitProps): React.ReactElement | null {
  const shouldRender = useShowsAds();

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
