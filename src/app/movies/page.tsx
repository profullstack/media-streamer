'use client';

/**
 * Movies Page
 *
 * Browse all movie torrents with sorting and filtering.
 */

import { MainLayout } from '@/components/layout';
import { BrowseGrid } from '@/components/browse';

export default function MoviesPage(): React.ReactElement {
  return (
    <MainLayout>
      <BrowseGrid
        contentType="movie"
        title="Movies"
        description="Browse and stream movies from your torrent collection"
        emptyMessage="No movies found. Add some movie torrents to get started."
      />
    </MainLayout>
  );
}
