'use client';

import { AdUnit } from '@/components/ads/ad-unit';
import { MainLayout } from '@/components/layout';

/**
 * Every blog page carries one CrawlProof unit under the post: the text strip,
 * which collapses to nothing when there is no advertiser and, like every
 * AdUnit here, renders nothing for signed-in members.
 */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <MainLayout>
      {children}
      <AdUnit format="text_link" className="flex justify-center" />
    </MainLayout>
  );
}
