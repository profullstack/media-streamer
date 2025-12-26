/**
 * Torrent Catalog Page
 * 
 * Browse and manage torrents
 */

import { TorrentCatalog } from '@/components/torrent-catalog';

export const metadata = {
  title: 'Torrent Catalog | BitTorrented',
  description: 'Browse and manage your torrent collection',
};

export default function CatalogPage() {
  return (
    <main className="container mx-auto h-[calc(100vh-4rem)] px-4 py-8">
      <TorrentCatalog />
    </main>
  );
}
