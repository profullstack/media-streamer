'use client';

/**
 * Torrent Catalog Component
 * 
 * Main component for browsing and managing torrents
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TorrentSearch, SearchOptions } from './torrent-search';
import { TorrentList, TorrentItem } from './torrent-list';
import { FileTree, FileItem } from './file-tree';
import { AddMagnetModal } from './add-magnet-modal';

interface TorrentsResponse {
  torrents: TorrentItem[];
  total: number;
}

interface FilesResponse {
  files: FileItem[];
  total: number;
}

export function TorrentCatalog(): React.ReactElement {
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentItem | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch torrents
  const fetchTorrents = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/torrents');
      if (response.ok) {
        const data: TorrentsResponse = await response.json();
        setTorrents(data.torrents);
      }
    } catch (error) {
      console.error('Failed to fetch torrents:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch files for selected torrent
  const fetchFiles = useCallback(async (torrentId: string) => {
    try {
      const response = await fetch(`/api/torrents/${torrentId}/files`);
      if (response.ok) {
        const data: FilesResponse = await response.json();
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTorrents();
  }, [fetchTorrents]);

  // Load files when torrent selected
  useEffect(() => {
    if (selectedTorrent) {
      fetchFiles(selectedTorrent.id);
    } else {
      setFiles([]);
    }
  }, [selectedTorrent, fetchFiles]);

  const handleSearch = useCallback((query: string, options?: SearchOptions) => {
    setSearchQuery(query);
    // Search implementation would filter torrents/files
    console.log('Search:', query, options);
  }, []);

  const handleTorrentSelect = useCallback((torrent: TorrentItem) => {
    setSelectedTorrent(torrent);
  }, []);

  const handleTorrentExpand = useCallback((torrent: TorrentItem) => {
    setSelectedTorrent(selectedTorrent?.id === torrent.id ? null : torrent);
  }, [selectedTorrent]);

  const handleFileSelect = useCallback((file: FileItem) => {
    console.log('File selected:', file);
    // Navigate to file or show details
  }, []);

  const handleStream = useCallback((file: FileItem) => {
    // Navigate to streaming page
    window.location.href = `/stream?torrent=${file.torrent_id}&file=${encodeURIComponent(file.path)}`;
  }, []);

  const handleModalSuccess = useCallback(() => {
    fetchTorrents();
  }, [fetchTorrents]);

  return (
    <div data-testid="torrent-catalog" className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Torrent Catalog
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Magnet
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <TorrentSearch 
          onSearch={handleSearch} 
          torrentId={selectedTorrent?.id}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Torrent List */}
        <div className="w-1/2 overflow-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : torrents.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-500">
              <svg className="mb-4 h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-lg font-medium">No torrents yet</p>
              <p className="mt-1 text-sm">Add a magnet URL to get started</p>
            </div>
          ) : (
            <TorrentList
              torrents={torrents}
              onSelect={handleTorrentSelect}
              onExpand={handleTorrentExpand}
              selectedId={selectedTorrent?.id}
            />
          )}
        </div>

        {/* File Tree */}
        <div className="w-1/2 overflow-auto">
          {selectedTorrent ? (
            <div>
              <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                {selectedTorrent.name}
              </h2>
              {files.length > 0 ? (
                <FileTree
                  files={files}
                  onFileSelect={handleFileSelect}
                  onStream={handleStream}
                />
              ) : (
                <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900">
              <p>Select a torrent to view files</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Magnet Modal */}
      <AddMagnetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
