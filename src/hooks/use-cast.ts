'use client';

/**
 * useCast: the Google Cast state for one player.
 *
 * `available` is false until the SDK has loaded AND a Cast device is on the
 * network, so a cast button only appears when pressing it can do something.
 * The SDK is loaded lazily by the first player that mounts this hook.
 */

import { useCallback, useEffect, useState } from 'react';
import { castMedia, loadCastSdk, type CastMedia, type CastSdk, type CastState } from '@/lib/cast/sender';

export interface UseCastResult {
  /** A device is reachable (or already connected). */
  available: boolean;
  connected: boolean;
  connecting: boolean;
  deviceName: string | null;
  /** The remote player is paused (only meaningful while connected). */
  remotePaused: boolean;
  /** Pick a device if needed, then play `media` on it. Rejects with a readable error. */
  cast: (media: CastMedia) => Promise<void>;
  togglePlay: () => void;
  stop: () => void;
}

export function useCast(): UseCastResult {
  const [sdk, setSdk] = useState<CastSdk | null>(null);
  const [state, setState] = useState<CastState>('NO_DEVICES_AVAILABLE');
  const [remotePaused, setRemotePaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadCastSdk().then((loaded) => {
      if (cancelled || !loaded) return;
      setSdk(loaded);
      setState(loaded.context.getCastState());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sdk) return;
    const { context, globals, player, controller } = sdk;
    const eventType = globals.cast.framework.CastContextEventType.CAST_STATE_CHANGED;
    const onState = (event: { castState?: CastState }) => setState(event.castState ?? context.getCastState());
    const onPlayer = () => setRemotePaused(player.isPaused);
    const anyChange = globals.cast.framework.RemotePlayerEventType.ANY_CHANGE;

    context.addEventListener(eventType, onState);
    controller.addEventListener(anyChange, onPlayer);
    return () => {
      context.removeEventListener(eventType, onState);
      controller.removeEventListener(anyChange, onPlayer);
    };
  }, [sdk]);

  const cast = useCallback(
    async (media: CastMedia) => {
      if (!sdk) throw new Error('Casting is not available in this browser');
      try {
        await castMedia(sdk, media);
      } catch (error) {
        // Closing the device picker rejects with "cancel"; that is not an error.
        if (error === 'cancel' || (error as { code?: string })?.code === 'cancel') return;
        throw error instanceof Error ? error : new Error(String((error as { description?: string })?.description ?? error));
      }
    },
    [sdk]
  );

  const togglePlay = useCallback(() => sdk?.controller.playOrPause(), [sdk]);
  const stop = useCallback(() => sdk?.context.endCurrentSession(true), [sdk]);

  const connected = state === 'CONNECTED';
  return {
    available: Boolean(sdk) && state !== 'NO_DEVICES_AVAILABLE',
    connected,
    connecting: state === 'CONNECTING',
    deviceName: connected ? (sdk?.context.getCurrentSession()?.getCastDevice().friendlyName ?? null) : null,
    remotePaused,
    cast,
    togglePlay,
    stop,
  };
}
