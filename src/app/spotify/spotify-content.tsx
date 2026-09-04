'use client';

/**
 * Spotify page body.
 *
 * Three views: pair an account, wait for a cast, and listen. The stream is a
 * live HLS playlist written by the user's own librespot process, so the player
 * is the same `attachSource` ladder the radio modal uses, attached on a click
 * (autoplay needs the gesture anyway) and torn down on Stop.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { attachSource } from '@profullstack/player';
import { LoadingSpinner } from '@/components/ui/icons';
import { useSpotifyStatus, type SpotifyStatus } from '@/hooks/use-spotify-status';

const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-60';
const buttonSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-60';

function stateLabel(status: SpotifyStatus): string {
  switch (status.state) {
    case 'pairing':
      return 'Waiting for you to enter the code';
    case 'connecting':
      return 'Connecting to Spotify';
    case 'online':
      return 'Ready. Cast to it from any Spotify app.';
    case 'playing':
      return 'Playing';
    case 'paused':
      return 'Paused';
    case 'error':
      return 'Not running';
    default:
      return 'Not connected';
  }
}

export function SpotifyContent(): React.ReactElement {
  const { status, isLoading, error, refetch } = useSpotifyStatus();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch('/api/spotify/connect', { method: 'POST', credentials: 'include' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `status ${res.status}`);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  const disconnect = useCallback(async () => {
    if (!window.confirm('Disconnect Spotify? You will need to pair again to listen.')) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch('/api/spotify/disconnect', { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-text-primary">Spotify</h1>
        <p className="text-sm text-text-secondary">
          Pair your Spotify Premium account and BitTorrented shows up as a speaker in your Spotify
          apps. Cast to it and the music plays here, in the browser.
        </p>
      </header>

      {error ? <p className="text-sm text-red-500">Could not load status: {error}</p> : null}
      {actionError ? <p className="text-sm text-red-500">{actionError}</p> : null}

      {isLoading && !status ? (
        <div className="inline-flex items-center gap-2 text-sm text-text-muted">
          <LoadingSpinner size={16} /> Loading
        </div>
      ) : null}

      {status && !status.connected && status.state !== 'pairing' ? (
        <section className="space-y-4 rounded-lg border border-border-default bg-bg-secondary p-4">
          <p className="text-sm text-text-secondary">
            Pairing opens a one-time code on Spotify&apos;s site. Enter it from your phone or any
            browser where you are signed in. Spotify Premium is required.
          </p>
          {status.state === 'error' && status.error ? (
            <p className="text-sm text-red-500">{status.error}</p>
          ) : null}
          <button type="button" className={buttonPrimary} onClick={() => void connect()} disabled={busy}>
            {busy ? <LoadingSpinner size={16} /> : null}
            Pair Spotify
          </button>
        </section>
      ) : null}

      {status?.state === 'pairing' ? <PairingCard status={status} /> : null}

      {status?.connected && status.state !== 'pairing' ? (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-secondary px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <span
                className={`h-2 w-2 rounded-full ${
                  status.state === 'error' ? 'bg-red-500' : status.state === 'connecting' ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
                aria-hidden
              />
              <span className="text-text-primary">{status.username ?? 'Spotify connected'}</span>
              <span className="text-text-muted">{stateLabel(status)}</span>
            </div>
            <button type="button" className="text-text-muted hover:text-text-primary" onClick={() => void disconnect()} disabled={busy}>
              Disconnect
            </button>
          </section>

          {status.state === 'error' && status.error ? (
            <p className="text-sm text-red-500">{status.error}</p>
          ) : null}

          <section className="space-y-2 rounded-lg border border-border-default bg-bg-secondary p-4 text-sm text-text-secondary">
            <p className="font-medium text-text-primary">How to play</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Open Spotify on your phone or desktop and start anything.</li>
              <li>
                Tap the devices icon and choose <span className="text-text-primary">{status.deviceName}</span>.
              </li>
              <li>Press Listen below.</li>
            </ol>
          </section>

          <NowPlaying status={status} />
          <Player status={status} />
        </>
      ) : null}
    </div>
  );
}

function PairingCard({ status }: { status: SpotifyStatus }): React.ReactElement {
  const pairing = status.pairing;
  return (
    <section className="space-y-4 rounded-lg border border-border-default bg-bg-secondary p-4">
      <p className="text-sm text-text-secondary">
        Enter this code at{' '}
        <a
          href={pairing?.url ?? 'https://spotify.com/pair'}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent-primary underline"
        >
          spotify.com/pair
        </a>{' '}
        while signed in to the account you want to use.
      </p>
      {pairing ? (
        <p className="rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-center font-mono text-3xl tracking-[0.4em] text-text-primary">
          {pairing.code}
        </p>
      ) : (
        <div className="inline-flex items-center gap-2 text-sm text-text-muted">
          <LoadingSpinner size={16} /> Getting a code from Spotify
        </div>
      )}
      <div className="inline-flex items-center gap-2 text-sm text-text-muted">
        <LoadingSpinner size={16} /> Waiting for Spotify to confirm
      </div>
    </section>
  );
}

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '';
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function NowPlaying({ status }: { status: SpotifyStatus }): React.ReactElement | null {
  const np = status.nowPlaying;
  if (!np || !np.name) return null;
  return (
    <section className="rounded-lg border border-border-default bg-bg-secondary p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {status.state === 'paused' ? 'Paused' : 'Now playing'}
      </p>
      <p className="mt-1 text-lg font-medium text-text-primary">{np.name}</p>
      <p className="text-sm text-text-secondary">
        {np.artists.join(', ')}
        {np.album ? ` · ${np.album}` : ''}
      </p>
      {np.durationMs ? (
        <p className="mt-1 text-xs text-text-muted">
          {formatMs(np.positionMs)} / {formatMs(np.durationMs)}
        </p>
      ) : null}
    </section>
  );
}

function Player({ status }: { status: SpotifyStatus }): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [listening, setListening] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const canListen = status.hasStream && (status.state === 'playing' || status.state === 'paused');

  useEffect(() => {
    if (!listening || !audioRef.current) return;
    const audio = audioRef.current;
    let cancelled = false;
    let attached: { destroy: () => void } | null = null;

    // attachSource sets the element's src only after its engine chunk loads,
    // so play() has to wait for the returned promise rather than run in this
    // same commit.
    void attachSource(audio, {
      src: status.streamUrl,
      kind: 'hls',
      live: true,
      onError: (message) => {
        if (!cancelled) setPlayerError(message);
      },
    })
      .then((result) => {
        if (cancelled) {
          result.destroy();
          return;
        }
        attached = result;
        audio.play().catch((err) => {
          console.error('[Spotify] Play error:', err);
          if (!cancelled) setPlayerError('Failed to play audio');
        });
      })
      .catch(() => {
        if (!cancelled) setPlayerError('Stream error. Cast something to the device and try again.');
      });

    return () => {
      cancelled = true;
      attached?.destroy();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [listening, status.streamUrl]);

  return (
    <section className="space-y-3 rounded-lg border border-border-default bg-bg-secondary p-4">
      <div className="flex flex-wrap items-center gap-3">
        {listening ? (
          <button type="button" className={buttonSecondary} onClick={() => setListening(false)}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={buttonPrimary}
            onClick={() => {
              setPlayerError(null);
              setListening(true);
            }}
            disabled={!canListen}
            title={canListen ? undefined : 'Cast something to the device first'}
          >
            Listen
          </button>
        )}
        {!canListen && !listening ? (
          <span className="text-sm text-text-muted">Nothing is being cast yet.</span>
        ) : null}
      </div>
      {playerError ? <p className="text-sm text-red-500">{playerError}</p> : null}
      <audio ref={audioRef} controls className={listening ? 'w-full' : 'hidden'} />
    </section>
  );
}
