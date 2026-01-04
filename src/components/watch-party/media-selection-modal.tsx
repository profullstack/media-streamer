'use client';

/**
 * Media Selection Modal for Watch Party
 *
 * Allows the host to browse torrents and select a media file
 * to share with the party.
 *
 * Automatically scales down on TV browsers to prevent scrolling.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';
import { useTvDetection } from '@/hooks/use-tv-detection';

interface TorrentItem {
  id: string;
  name: string;
  cleanTitle: string | null;
  size: number;
  files_count: number;
  created_at: string;
}

interface FileItem {
  id: string;
  torrent_id: string;
  path: string;
  name: string;
  size: number;
  media_type: string;
  extension: string;
}

interface MediaSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: FileItem, torrent: TorrentItem) => void;
}

interface TorrentsResponse {
  torrents: TorrentItem[];
  total: number;
}

interface FilesResponse {
  files: FileItem[];
  total: number;
}

function getMediaIcon(mediaType: string): React.ReactElement {
  switch (mediaType) {
    case 'audio':
      return (
        <svg className="h-5 w-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case 'video':
      return (
        <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    default:
      return (
        <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
  }
}

function isStreamable(mediaType: string): boolean {
  return ['audio', 'video'].includes(mediaType);
}

export function MediaSelectionModal({ isOpen, onClose, onSelect }: MediaSelectionModalProps): React.ReactElement | null {
  const { isTv } = useTvDetection();
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentItem | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingTorrents, setIsLoadingTorrents] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch torrents when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchTorrents();
    }
  }, [isOpen]);

  // Fetch files when torrent is selected
  useEffect(() => {
    if (selectedTorrent) {
      fetchFiles(selectedTorrent.id);
    } else {
      setFiles([]);
    }
  }, [selectedTorrent]);

  const fetchTorrents = async (): Promise<void> => {
    setIsLoadingTorrents(true);
    setError(null);
    try {
      const response = await fetch('/api/torrents');
      if (!response.ok) {
        throw new Error('Failed to fetch torrents');
      }
      const data: TorrentsResponse = await response.json();
      setTorrents(data.torrents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load torrents');
    } finally {
      setIsLoadingTorrents(false);
    }
  };

  const fetchFiles = async (torrentId: string): Promise<void> => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch(`/api/torrents/${torrentId}/files`);
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      const data: FilesResponse = await response.json();
      setFiles(data.files);
    } catch (err) {
      console.error('Failed to fetch files:', err);
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleFileSelect = useCallback((file: FileItem) => {
    if (selectedTorrent && isStreamable(file.media_type)) {
      onSelect(file, selectedTorrent);
      onClose();
    }
  }, [selectedTorrent, onSelect, onClose]);

  const handleClose = useCallback(() => {
    setSelectedTorrent(null);
    setFiles([]);
    setError(null);
    onClose();
  }, [onClose]);

  // Filter to only show streamable files
  const streamableFiles = files.filter(f => isStreamable(f.media_type));

  if (!isOpen) return null;

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center',
      // Smaller padding on TV to maximize usable space
      isTv ? 'p-1' : 'p-2 sm:p-4'
    )}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal - smaller on TV to prevent scrolling */}
      <div className={cn(
        'relative z-10 w-full',
        // Smaller max-width and max-height on TV
        isTv ? 'max-w-3xl max-h-[calc(100dvh-0.5rem)]' : 'max-w-4xl max-h-[80vh]',
        'bg-bg-secondary rounded-xl border border-border-subtle',
        'shadow-2xl overflow-hidden flex flex-col'
      )}>
        {/* Header - smaller padding on TV */}
        <div className={cn(
          'flex items-center justify-between border-b border-border-subtle',
          isTv ? 'p-2' : 'p-4'
        )}>
          <h2 className={cn(
            'font-semibold text-text-primary',
            isTv ? 'text-base' : 'text-xl'
          )}>
            Select Media for Watch Party
          </h2>
          <button
            onClick={handleClose}
            className={cn(
              'rounded-lg hover:bg-bg-tertiary transition-colors',
              isTv ? 'p-1' : 'p-2'
            )}
          >
            <svg className={cn(
              'text-text-secondary',
              isTv ? 'w-4 h-4' : 'w-5 h-5'
            )} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Torrent List - smaller padding on TV */}
          <div className={cn(
            'w-1/2 border-r border-border-subtle overflow-y-auto',
            isTv ? 'p-2' : 'p-4'
          )}>
            <h3 className={cn(
              'font-medium text-text-secondary',
              isTv ? 'text-xs mb-2' : 'text-sm mb-3'
            )}>
              Select a Torrent
            </h3>
            
            {error ? <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm mb-3">
                {error}
              </div> : null}

            {isLoadingTorrents ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-8 w-8 border-4 border-accent-primary border-t-transparent rounded-full" />
              </div>
            ) : torrents.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <p>No torrents available</p>
                <p className="text-sm mt-1">Add a magnet link from the catalog first</p>
              </div>
            ) : (
              <div className="space-y-2">
                {torrents.map((torrent) => (
                  <button
                    key={torrent.id}
                    onClick={() => setSelectedTorrent(torrent)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-colors',
                      'border',
                      selectedTorrent?.id === torrent.id
                        ? 'bg-accent-primary/10 border-accent-primary'
                        : 'bg-bg-tertiary border-border-subtle hover:border-accent-primary/50'
                    )}
                  >
                    <p className="font-medium text-text-primary truncate" title={torrent.name}>
                      {torrent.cleanTitle ?? torrent.name}
                    </p>
                    <p className="text-sm text-text-muted mt-1">
                      {formatBytes(torrent.size)} · {torrent.files_count} files
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* File List - smaller padding on TV */}
          <div className={cn(
            'w-1/2 overflow-y-auto',
            isTv ? 'p-2' : 'p-4'
          )}>
            <h3 className={cn(
              'font-medium text-text-secondary',
              isTv ? 'text-xs mb-2' : 'text-sm mb-3'
            )}>
              {selectedTorrent ? 'Select a Media File' : 'Files'}
            </h3>

            {!selectedTorrent ? (
              <div className={cn(
                'text-center text-text-muted',
                isTv ? 'py-4 text-xs' : 'py-8'
              )}>
                <p>Select a torrent to view files</p>
              </div>
            ) : isLoadingFiles ? (
              <div className={cn(
                'flex items-center justify-center',
                isTv ? 'py-4' : 'py-8'
              )}>
                <div className={cn(
                  'animate-spin border-4 border-accent-primary border-t-transparent rounded-full',
                  isTv ? 'h-6 w-6' : 'h-8 w-8'
                )} />
              </div>
            ) : streamableFiles.length === 0 ? (
              <div className={cn(
                'text-center text-text-muted',
                isTv ? 'py-4 text-xs' : 'py-8'
              )}>
                <p>No streamable media files</p>
                <p className={cn(
                  'mt-1',
                  isTv ? 'text-[10px]' : 'text-sm'
                )}>Only audio and video files can be shared</p>
              </div>
            ) : (
              <div className={isTv ? 'space-y-1' : 'space-y-2'}>
                {streamableFiles.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => handleFileSelect(file)}
                    className={cn(
                      'w-full text-left rounded-lg transition-colors',
                      'bg-bg-tertiary border border-border-subtle',
                      'hover:border-accent-primary hover:bg-accent-primary/5',
                      'flex items-center',
                      isTv ? 'p-2 gap-2' : 'p-3 gap-3'
                    )}
                  >
                    {getMediaIcon(file.media_type)}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'font-medium text-text-primary truncate',
                        isTv && 'text-sm'
                      )}>
                        {file.name}
                      </p>
                      <p className={cn(
                        'text-text-muted',
                        isTv ? 'text-xs' : 'text-sm'
                      )}>
                        {formatBytes(file.size)} · {file.extension.toUpperCase()}
                      </p>
                    </div>
                    <span className={cn(
                      'rounded font-medium',
                      isTv ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                      file.media_type === 'video'
                        ? 'bg-blue-500/10 text-blue-500'
                        : 'bg-purple-500/10 text-purple-500'
                    )}>
                      {file.media_type === 'video' ? 'Video' : 'Audio'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer - smaller padding on TV */}
        <div className={cn(
          'border-t border-border-subtle bg-bg-tertiary',
          isTv ? 'p-2' : 'p-4'
        )}>
          <p className={cn(
            'text-text-muted text-center',
            isTv ? 'text-xs' : 'text-sm'
          )}>
            Select a video or audio file to share with your watch party
          </p>
        </div>
      </div>
    </div>
  );
}
