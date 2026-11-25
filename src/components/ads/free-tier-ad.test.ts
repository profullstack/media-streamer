/**
 * Where a free account's one sponsored line may appear.
 */

import { describe, expect, it } from 'vitest';
import { FREE_TIER_AD_PATHS, showsFreeTierAd } from './free-tier-ad';
import { accessFor } from '@/lib/legal-mode';

describe('the free account ad line', () => {
  it('appears on the browsing pages a free member can open', () => {
    for (const p of ['/podcasts', '/podcasts/some-show', '/invites', '/vod/HQiE_OMRBuu6']) {
      expect(showsFreeTierAd(p), p).toBe(true);
    }
  });

  it('never appears on a home page, a sales or checkout page, or anything a member is doing', () => {
    for (const p of [
      '/',
      '/features',
      '/invite-only',
      '/pricing',
      '/pay/abc',
      '/login',
      '/signup',
      '/account',
      '/settings',
      '/email',
      '/watch-party',
      '/live',
      '/live-tv',
      '/seedboxes',
      // The blog places its own single unit; a layout line there would make two.
      '/blog',
      '/blog/some-post',
      '/podcastsx',
    ]) {
      expect(showsFreeTierAd(p), p).toBe(false);
    }
  });

  it('is only ever on a page a free member is actually served', () => {
    for (const p of FREE_TIER_AD_PATHS) expect(accessFor(p), p).toBe('open');
  });
});
