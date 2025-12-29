'use client';

/**
 * Torrents Page
 * 
 * Lists all indexed torrents and allows adding new ones.
 */

import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { AddMagnetModal, TorrentList } from '@/components/torrents';
import { PlusIcon } from '@/components/ui/icons';

interface Torrent {
  id: string;
  infohash: string;
  name: string;
  totalSize: number;
  fileCount: number;
  createdAt: string;
  /** Number of seeders (peers with complete copies), null if unknown */
  seeders?: number | null;
  /** Number of leechers (peers downloading), null if unknown */
  leechers?: number | null;
}

interface TorrentsResponse {
  torrents: Torrent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export default function TorrentsPage(): React.ReactElement {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTorrents = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // For now, we'll use a placeholder since we don't have a list endpoint yet
      // In a real implementation, this would fetch from /api/torrents
      const response = await fetch('/api/torrents?limit=50');
      
      if (!response.ok) {
        // If the endpoint doesn't exist yet, just show empty state
        setTorrents([]);
        return;
      }

      const data: TorrentsResponse = await response.json();
      setTorrents(data.torrents);
    } catch {
      // Show empty state on error
      setTorrents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTorrents();
  }, [fetchTorrents]);

  const handleOpenModal = useCallback((): void => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback((): void => {
    setIsModalOpen(false);
  }, []);

  const handleTorrentAdded = useCallback((): void => {
    // Refresh the list after adding a torrent
    fetchTorrents();
  }, [fetchTorrents]);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Torrents</h1>
            <p className="mt-1 text-text-secondary">
              Manage your indexed torrents
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="btn-primary flex items-center gap-2 px-4 py-2"
          >
            <PlusIcon size={18} />
            <span>Add Torrent</span>
          </button>
        </div>

        {/* Error message */}
        {error ? <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div> : null}

        {/* Torrent list */}
        <TorrentList
          torrents={torrents}
          isLoading={isLoading}
          emptyMessage="No torrents yet. Add a magnet link to get started."
        />
      </div>

      {/* Add magnet modal */}
      <AddMagnetModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleTorrentAdded}
      />
    </MainLayout>
  );
}
