'use client';

/**
 * News Page
 *
 * Displays news articles from TheNewsAPI.
 * This is a premium feature.
 */

import { MainLayout } from '@/components/layout';
import { NewsSection } from '@/components/news';

export default function NewsPage(): React.ReactElement {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">News</h1>
          <p className="mt-2 text-text-secondary">
            Stay up to date with the latest entertainment news
          </p>
        </div>

        <NewsSection limit={20} />
      </div>
    </MainLayout>
  );
}
