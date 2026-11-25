'use client';

/**
 * The one ad a free account sees: a single thin sponsored text line at the top of the
 * content on a few browsing pages, with a way out beside it.
 *
 * The house rules for ads (all of them standing): one text_link per page and no boxes,
 * never on a home page, never in or against the footer. On top of those, this stays off
 * anything a member is doing rather than browsing: the watch party room, the mailbox,
 * the account, settings and checkout pages, and the pages that sell the plan. An ad next
 * to the "buy" button, or over a film, is not tasteful and not worth the line.
 *
 * So it is an allowlist. A page not named here has no layout ad. Pages that place their
 * own unit (the blog) are not named, or they would carry two.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdUnit, useShowsAds } from './ad-unit';

/** Browsing pages a free member can open. Each gets the one line. */
export const FREE_TIER_AD_PATHS = ['/podcasts', '/invites', '/vod'];

export function showsFreeTierAd(pathname: string): boolean {
  return FREE_TIER_AD_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function FreeTierAd(): React.ReactElement | null {
  const pathname = usePathname() ?? '';
  const showsAds = useShowsAds();
  if (!showsAds || !showsFreeTierAd(pathname)) return null;

  return (
    <aside aria-label="Sponsored" className="mb-4 flex items-center gap-3 border-b border-border-subtle pb-3">
      <AdUnit format="text_link" className="min-w-0 flex-1" />
      <Link
        href="/pricing?upgrade=no-ads"
        className="shrink-0 text-xs text-text-muted underline-offset-2 hover:text-accent-primary hover:underline"
      >
        Go ad-free
      </Link>
    </aside>
  );
}
