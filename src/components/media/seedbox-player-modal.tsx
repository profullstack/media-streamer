'use client';

/**
 * Seedbox Player Modal
 *
 * Plays a completed file straight from the seedbox file server (torlnk files),
 * proxied through /api/seedbox/stream so the seedbox token stays server-side and
 * Range requests (seeking) work. Deliberately simple — the browser's own
 * <video>/<audio> controls, no WebTorrent/transcoding pipeline (the file is
 * already whole on the seedbox, so there's nothing to transcode on the fly).
 *
 * The source is attached with @profullstack/player's `attachSource`, so the
 * engine is chosen the way every fleet player chooses it: an MP4 or MP3 plays
 * natively, and a .ts or .m3u8 sitting on the seedbox gets mpegts.js or hls.js
 * instead of an element that cannot decode it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { attachSource, detectKind, type SourceKind } from '@profullstack/player';
import { Modal } from '@/components/ui/modal';
import { PlaybackSourceBadge } from './playback-source-badge';
import { CastButton } from '@/components/cast/cast-button';
import type { TorrentFile } from '@/types';

interface SeedboxPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: TorrentFile | null;
  /** Called when the user chooses to fall back to swarm/server playback. */
  onPlayFromSwarm?: () => void;
}

export function SeedboxPlayerModal({
  isOpen,
  onClose,
  file,
  onPlayFromSwarm,
}: SeedboxPlayerModalProps): React.ReactElement | null {
  const src = useMemo(
    () => (file ? `/api/seedbox/stream?path=${encodeURIComponent(file.path)}` : null),
    [file]
  );
  const [failed, setFailed] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const category = file?.mediaCategory;
  const playable = category === 'video' || category === 'audio';

  /*
   * The stream URL's path is /api/seedbox/stream for every file, so it says
   * nothing about the format. The file's own name does.
   */
  const kind = useMemo((): SourceKind | null => {
    if (!file || !playable) return null;
    const fromName = detectKind({ src: file.name });
    if (fromName !== 'unknown') return fromName;
    return category === 'audio' ? 'audio' : 'mp4';
  }, [file, playable, category]);

  // Reset the error state whenever a new file is opened.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  // Attach the source once the element exists; tear it down on change/close.
  useEffect(() => {
    const media = mediaRef.current;
    if (!isOpen || !src || !kind || failed || !media) return;
    let cancelled = false;
    let attached: { destroy: () => void } | null = null;

    void attachSource(media, {
      src,
      kind,
      onError: () => {
        if (!cancelled) setFailed(true);
      },
    })
      .then((result) => {
        if (cancelled) {
          result.destroy();
          return;
        }
        attached = result;
        if (result.unplayable) return;
        media.play().catch(() => {
          // Autoplay refused; the controls are there to start it by hand.
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      attached?.destroy();
    };
  }, [isOpen, src, kind, failed]);

  if (!file || !src) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={file.name} size="4xl">
      <div ref={scopeRef} className="p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <PlaybackSourceBadge source="seedbox" />
          {!failed && (file.mediaCategory === 'video' || file.mediaCategory === 'audio') ? (
            <CastButton
              media={{ url: src, filename: file.name, title: file.name, kind: file.mediaCategory }}
              getMediaElement={() => scopeRef.current?.querySelector<HTMLMediaElement>('video, audio') ?? null}
            />
          ) : null}
        </div>
        {failed ? (
          <div className="py-8 text-center">
            <p className="text-sm text-text-primary">Couldn&apos;t stream this file from your seedbox.</p>
            <p className="mt-1 text-xs text-text-muted">
              It may not have finished downloading there yet. Send this torrent to your seedbox, or play it from
              the swarm instead.
            </p>
            {onPlayFromSwarm ? (
              <button
                type="button"
                onClick={onPlayFromSwarm}
                className="mt-4 inline-block rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
              >
                Play from swarm instead
              </button>
            ) : null}
          </div>
        ) : file.mediaCategory === 'video' ? (
          <video
            ref={mediaRef}
            controls
            autoPlay
            playsInline
            onError={() => setFailed(true)}
            className="max-h-[75vh] w-full rounded-lg bg-black"
          />
        ) : file.mediaCategory === 'audio' ? (
          <div className="py-8">
            <audio ref={mediaRef} controls autoPlay onError={() => setFailed(true)} className="w-full" />
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
        {!failed ? (
          <p className="mt-2 text-xs text-text-muted">
            Streaming from seedbox. If it doesn&apos;t start, the download may not have finished there yet.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
