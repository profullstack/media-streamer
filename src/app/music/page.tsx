'use client';

/**
 * Music Page
 *
 * Browse all music torrents with sorting and filtering.
 */

import { MainLayout } from '@/components/layout';
import { BrowseGrid } from '@/components/browse';

export default function MusicPage(): React.ReactElement {
  return (
    <MainLayout>
      <BrowseGrid
        contentType="music"
        title="Music"
        description="Browse and stream music from your torrent collection"
        emptyMessage="No music found. Add some music torrents to get started."
      />
    </MainLayout>
  );
}
