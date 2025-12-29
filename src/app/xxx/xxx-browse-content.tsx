'use client';

/**
 * XXX Browse Content Component
 *
 * Client component for browsing adult content.
 * This component is only rendered after server-side auth check passes.
 */

import { BrowseGrid } from '@/components/browse';

export function XxxBrowseContent(): React.ReactElement {
  return (
    <BrowseGrid
      contentType="xxx"
      title="Adult Content"
      description="Browse adult content from your torrent collection"
      emptyMessage="No adult content found. Add some torrents to get started."
    />
  );
}
