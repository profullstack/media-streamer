'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LoadingSpinner,
} from '@/components/ui/icons';
import { cn, formatBytes } from '@/lib/utils';
import { formatSpeedCompact } from './media-player-utils';
import type { TorrentFile } from '@/types';

interface ConnectionStatus {
  stage: 'initializing' | 'connecting' | 'searching_peers' | 'downloading_metadata' | 'buffering' | 'ready' | 'error';
  message: string;
  numPeers: number;
  progress: number;
  fileProgress?: number;
  downloadSpeed: number;
  uploadSpeed: number;
  downloaded: number;
  uploaded: number;
  ready: boolean;
  fileReady?: boolean;
  fileIndex?: number;
  timestamp: number;
}

export interface ImageGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: TorrentFile[];
  initialFile: TorrentFile | null;
  infohash: string;
  torrentName: string;
}

function streamUrl(infohash: string, fileIndex: number, download = false): string {
  const params = new URLSearchParams({
    infohash,
    fileIndex: String(fileIndex),
  });
  if (download) params.set('download', '1');
  return `/api/stream?${params.toString()}`;
}

export function ImageGalleryModal({
  isOpen,
  onClose,
  files,
  initialFile,
  infohash,
  torrentName,
}: ImageGalleryModalProps): React.ReactElement | null {
  const initialIndex = useMemo(() => {
    if (!initialFile) return 0;
    const foundIndex = files.findIndex((file) => file.id === initialFile.id);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [files, initialFile]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const currentFile = files[currentIndex] ?? null;
  const currentUrl = currentFile ? streamUrl(infohash, currentFile.fileIndex) : null;
  const downloadUrl = currentFile ? streamUrl(infohash, currentFile.fileIndex, true) : null;

  const selectIndex = useCallback((nextIndex: number) => {
    setConnectionStatus(null);
    setIsImageLoaded(false);
    setImageError(null);
    setCurrentIndex(nextIndex);
  }, []);

  const goPrevious = useCallback(() => {
    if (files.length === 0) return;
    selectIndex((currentIndex - 1 + files.length) % files.length);
  }, [currentIndex, files.length, selectIndex]);

  const goNext = useCallback(() => {
    if (files.length === 0) return;
    selectIndex((currentIndex + 1) % files.length);
  }, [currentIndex, files.length, selectIndex]);

  useEffect(() => {
    if (!isOpen || !currentFile || !infohash) {
      return;
    }

    const statusUrl = `/api/stream/status?infohash=${infohash}&fileIndex=${currentFile.fileIndex}&persistent=true`;
    const eventSource = new EventSource(statusUrl);

    eventSource.onmessage = (event) => {
      try {
        const status = JSON.parse(event.data as string) as ConnectionStatus;
        setConnectionStatus(status);
      } catch (error) {
        console.error('[ImageGalleryModal] Failed to parse stream status:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[ImageGalleryModal] Stream status error:', error);
    };

    return () => {
      eventSource.close();
    };
  }, [currentFile, infohash, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentFile || files.length < 2) return;

    const neighborIndexes = [
      (currentIndex + 1) % files.length,
      (currentIndex - 1 + files.length) % files.length,
    ];

    for (const index of neighborIndexes) {
      const file = files[index];
      if (!file) continue;
      const image = new window.Image();
      image.src = streamUrl(infohash, file.fileIndex);
    }
  }, [currentFile, currentIndex, files, infohash, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrevious, isOpen]);

  if (!isOpen || !currentFile || !currentUrl) return null;

  const displayProgress = connectionStatus?.fileProgress ?? connectionStatus?.progress ?? 0;
  const isReady = connectionStatus?.fileReady ?? connectionStatus?.ready ?? false;
  const showLoadingOverlay = !isImageLoaded && !imageError;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={torrentName} size="full" className="bg-black">
      <div className="flex h-[calc(100dvh-8rem)] min-h-[420px] flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-1 pb-3 text-xs text-white/70">
          <span className="min-w-0 truncate text-white" title={currentFile.path}>
            {currentFile.name}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <span>{currentIndex + 1} / {files.length}</span>
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download={currentFile.name}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                title="Download image"
                aria-label={`Download ${currentFile.name}`}
              >
                <DownloadIcon size={16} />
              </a>
            ) : null}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
          {files.length > 1 ? (
            <button
              type="button"
              onClick={goPrevious}
              className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus:outline-hidden focus:ring-2 focus:ring-accent-primary"
              aria-label="Previous image"
              title="Previous image"
            >
              <ChevronLeftIcon size={26} />
            </button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element -- Torrent images stream from the app endpoint. */}
          <img
            key={currentFile.id}
            src={currentUrl}
            alt={currentFile.name}
            className={cn(
              'max-h-full max-w-full object-contain transition-opacity duration-200',
              isImageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setIsImageLoaded(true)}
            onError={() => setImageError('Image failed to load. The torrent may not have enough peers yet.')}
          />

          {showLoadingOverlay ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center text-white">
              <LoadingSpinner size={34} className="text-accent-primary" />
              <div>
                <p className="text-sm font-medium">
                  {connectionStatus?.message ?? 'Connecting to torrent...'}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {isReady ? 'Rendering image...' : 'Preparing image stream'}
                </p>
              </div>
            </div>
          ) : null}

          {imageError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
              <p className="max-w-md text-sm text-white/80">{imageError}</p>
            </div>
          ) : null}

          {files.length > 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus:outline-hidden focus:ring-2 focus:ring-accent-primary"
              aria-label="Next image"
              title="Next image"
            >
              <ChevronRightIcon size={26} />
            </button>
          ) : null}
        </div>

        <div className="border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', isImageLoaded ? 'bg-green-500' : 'bg-accent-primary animate-pulse')} />
              <span className="truncate">
                {isImageLoaded ? 'Image loaded' : connectionStatus?.message ?? 'Connecting'}
              </span>
            </div>
            {connectionStatus ? (
              <div className="flex shrink-0 items-center gap-3">
                <span title="Connected peers">Peers {connectionStatus.numPeers}</span>
                {displayProgress > 0 && displayProgress < 1 ? <span>{Math.round(displayProgress * 100)}%</span> : null}
                {connectionStatus.downloadSpeed > 0 ? <span>↓ {formatSpeedCompact(connectionStatus.downloadSpeed)}</span> : null}
                {connectionStatus.downloaded > 0 ? <span>{formatBytes(connectionStatus.downloaded)}</span> : null}
              </div>
            ) : null}
          </div>
          {displayProgress > 0 && displayProgress < 1 ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-accent-primary transition-all duration-300"
                style={{ width: `${displayProgress * 100}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
