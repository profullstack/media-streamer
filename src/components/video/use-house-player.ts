'use client';

/**
 * Puts the house player (@profullstack/player) around a <video> the page
 * already owns.
 *
 * Pages like the watch party and VOD keep a ref to their <video> to sync,
 * seek and translate it, so instead of letting the player build its own
 * element (as VideoPlayer does) this hands the page's element in as `media`.
 * The player draws its control bar in `rootRef`, attaches the source and
 * leaves the element in place when it is destroyed. Pass `src: null` to
 * mount nothing.
 */

import { useEffect, type RefObject } from 'react';
import { createPlayer } from '@profullstack/player';
import '@profullstack/player/player.css';

export interface HousePlayerSource {
  src: string | null;
  /** Playback MIME type; stream URLs carry no extension to sniff. */
  mimeType?: string;
  poster?: string;
  autoplay?: boolean;
}

export function useHousePlayer(
  rootRef: RefObject<HTMLElement | null>,
  mediaRef: RefObject<HTMLVideoElement | null>,
  { src, mimeType, poster, autoplay = false }: HousePlayerSource,
): void {
  useEffect(() => {
    const root = rootRef.current;
    const media = mediaRef.current;
    if (!root || !media || !src) return;
    const handle = createPlayer(root, {
      src,
      media,
      ...(mimeType ? { mimeType } : {}),
      ...(poster ? { poster } : {}),
      autoplay,
    });
    return () => handle.destroy();
  }, [rootRef, mediaRef, src, mimeType, poster, autoplay]);
}
