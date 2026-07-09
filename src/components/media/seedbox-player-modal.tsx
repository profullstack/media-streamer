'use client';

/**
 * Seedbox Player Modal
 *
 * Plays a completed file straight from the seedbox file server (torlnk files),
 * proxied through /api/seedbox/stream so the seedbox token stays server-side and
 * Range requests (seeking) work. Deliberately simple — a direct <video>/<audio>
 * source, no WebTorrent/HLS/transcoding pipeline (the file is already whole on
 * the seedbox, so there's nothing to transcode on the fly).
 */

import { useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import type { TorrentFile } from '@/types';

interface SeedboxPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: TorrentFile | null;
}

export function SeedboxPlayerModal({
  isOpen,
  onClose,
  file,
}: SeedboxPlayerModalProps): React.ReactElement | null {
  const src = useMemo(
    () => (file ? `/api/seedbox/stream?path=${encodeURIComponent(file.path)}` : null),
    [file]
  );

  if (!file || !src) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={file.name} size="4xl">
      <div className="p-2">
        {file.mediaCategory === 'video' ? (
          <video src={src} controls autoPlay className="max-h-[75vh] w-full rounded-lg bg-black" />
        ) : file.mediaCategory === 'audio' ? (
          <div className="py-8">
            <audio src={src} controls autoPlay className="w-full" />
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-text-muted">This file type can&apos;t be played inline.</p>
            <a
              href={src}
              download={file.name}
              className="mt-3 inline-block rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Download from seedbox
            </a>
          </div>
        )}
        <p className="mt-2 text-xs text-text-muted">
          Streaming from seedbox. If it doesn&apos;t start, the download may not have finished there yet.
        </p>
      </div>
    </Modal>
  );
}
