'use client';

/**
 * TV Shows Page
 *
 * Browse all TV show torrents with sorting and filtering.
 */

import { MainLayout } from '@/components/layout';
import { BrowseGrid } from '@/components/browse';

export default function TVShowsPage(): React.ReactElement {
  return (
    <MainLayout>
      <BrowseGrid
        contentType="tvshow"
        title="TV Shows"
        description="Browse and stream TV shows from your torrent collection"
        emptyMessage="No TV shows found. Add some TV show torrents to get started."
      />
    </MainLayout>
  );
}
