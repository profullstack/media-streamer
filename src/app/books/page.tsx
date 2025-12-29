'use client';

/**
 * Books Page
 *
 * Browse all book/ebook torrents with sorting and filtering.
 */

import { MainLayout } from '@/components/layout';
import { BrowseGrid } from '@/components/browse';

export default function BooksPage(): React.ReactElement {
  return (
    <MainLayout>
      <BrowseGrid
        contentType="book"
        title="Books"
        description="Browse and read ebooks from your torrent collection"
        emptyMessage="No books found. Add some ebook torrents to get started."
      />
    </MainLayout>
  );
}
