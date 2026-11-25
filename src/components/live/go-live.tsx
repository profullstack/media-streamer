'use client';

/**
 * Go live on c0mpute Live.
 *
 * The member's own camera or screen, recorded by the browser in two-second
 * pieces and posted in order to /api/live/ingest, where one encoder pushes it
 * to c0mpute. Connecting c0mpute is a one-time OAuth round trip; after that
 * going live is one click.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { pickRecorderMime, formatElapsed, endedMessage, CHUNK_MS, MAX_QUEUE, VIDEO_BPS, AUDIO_BPS } from './recorder';

interface Status {
  connected: boolean;
  watchUrl: string | null;
  playbackUrl: string | null;
  accountLabel: string | null;
  visibility: 'public' | 'unlisted' | null;
  live: { active: boolean; startedAt: string | null; ended: { reason: string } | null };
}

type Source = 'camera' | 'screen';

const OUTCOMES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'c0mpute is connected. You can go live now.' },
  denied: { ok: false, text: 'You declined the request on c0mpute, so nothing was connected.' },
  failed: { ok: false, text: 'Connecting c0mpute did not finish. Please try again.' },
};

const card = 'rounded-xl border border-border-subtle bg-bg-secondary p-6';
const primary = cn(
  'flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors',
  'bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
);
const secondary = cn(
  'rounded-lg px-4 py-2 text-sm transition-colors',
  'bg-bg-tertiary text-text-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed'
);

export function GoLive(): React.ReactElement {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('unlisted');
  const [source, setSource] = useState<Source>('camera');
  const [phase, setPhase] = useState<'idle' | 'starting' | 'live' | 'stopping'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [supported, setSupported] = useState(true);

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<string | null>(null);
  const queueRef = useRef<Blob[]>([]);
  const sendingRef = useRef(false);
  const seqRef = useRef(0);
  const startedRef = useRef(0);

  const refresh = useCallback(async (): Promise<Status | null> => {
    try {
      const res = await fetch('/api/live/status', { cache: 'no-store' });
      const body = (await res.json()) as Status & { error?: string };
      if (!res.ok) {
        setLoadError(body.error ?? 'Could not load your live status');
        return null;
      }
      setLoadError(null);
      setStatus(body);
      return body;
    } catch {
      setLoadError('Could not load your live status');
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const status = refresh();
      if (!alive) return;
      setSupported(
        typeof MediaRecorder !== 'undefined' &&
          typeof navigator !== 'undefined' &&
          Boolean(navigator.mediaDevices?.getUserMedia) &&
          pickRecorderMime((m) => MediaRecorder.isTypeSupported(m)) !== null
      );
      const outcome = new URLSearchParams(window.location.search).get('c0mpute');
      if (outcome && OUTCOMES[outcome]) {
        setNotice(OUTCOMES[outcome]);
        window.history.replaceState(null, '', '/live');
      }
      await status;
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  /** Let go of the camera or screen and the recorder. Does not talk to the server. */
  const releaseCapture = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    queueRef.current = [];
    sessionRef.current = null;
  }, []);

  const stop = useCallback(
    async (why?: string) => {
      if (!sessionRef.current && !streamRef.current) return;
      setPhase('stopping');
      releaseCapture();
      try {
        await fetch('/api/live/session', { method: 'DELETE', keepalive: true });
      } catch {
        // The server stops a session that goes quiet on its own.
      }
      setPhase('idle');
      setElapsed(0);
      if (why) setError(why);
      void refresh();
    },
    [releaseCapture, refresh]
  );

  /** Post what is queued, one piece at a time, in order. */
  const pump = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      while (queueRef.current.length > 0 && sessionRef.current) {
        const chunk = queueRef.current[0];
        const sessionId = sessionRef.current;
        const seq = seqRef.current;
        const res = await fetch(`/api/live/ingest?session=${encodeURIComponent(sessionId)}&seq=${String(seq)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: chunk,
        });
        if (sessionRef.current !== sessionId) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          const ended = await refresh();
          void stop(endedMessage(ended?.live.ended?.reason) ?? body.error ?? 'The stream stopped.');
          return;
        }
        queueRef.current.shift();
        seqRef.current = seq + 1;
      }
    } catch {
      void stop('The connection dropped, so the stream was stopped.');
    } finally {
      sendingRef.current = false;
    }
  }, [refresh, stop]);

  const goLive = useCallback(async () => {
    setError(null);
    setNotice(null);
    const mimeType = typeof MediaRecorder === 'undefined' ? null : pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType) {
      setError('This browser cannot record video for a live stream. Try a current Chrome, Edge or Firefox.');
      return;
    }
    setPhase('starting');

    let stream: MediaStream;
    try {
      if (source === 'screen') {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('unsupported');
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        // The microphone too, when it is allowed; a screen with no mic is still a stream.
        let mic: MediaStream | null = null;
        if (screen.getAudioTracks().length === 0) {
          try {
            mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            mic = null;
          }
        }
        stream = new MediaStream([...screen.getVideoTracks(), ...(mic ?? screen).getAudioTracks()]);
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: true,
        });
      }
    } catch (err) {
      setPhase('idle');
      setError(
        err instanceof Error && err.message === 'unsupported'
          ? 'This browser cannot share a screen. Use the camera, or try a desktop browser.'
          : `Could not get your ${source === 'screen' ? 'screen' : 'camera and microphone'}. Allow access in the browser and try again.`
      );
      return;
    }

    streamRef.current = stream;
    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      void previewRef.current.play().catch(() => undefined);
    }

    try {
      const res = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mimeType }),
      });
      const body = (await res.json()) as { sessionId?: string; error?: string };
      if (!res.ok || !body.sessionId) throw new Error(body.error ?? 'Could not start the stream');
      sessionRef.current = body.sessionId;
    } catch (err) {
      releaseCapture();
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Could not start the stream');
      return;
    }

    seqRef.current = 0;
    queueRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BPS,
      audioBitsPerSecond: AUDIO_BPS,
    });
    recorder.ondataavailable = (event: BlobEvent) => {
      if (!event.data || event.data.size === 0 || !sessionRef.current) return;
      queueRef.current.push(event.data);
      if (queueRef.current.length > MAX_QUEUE) {
        void stop('Your connection is too slow to keep up, so the stream was stopped.');
        return;
      }
      void pump();
    };
    recorder.onerror = () => void stop('Recording failed, so the stream was stopped.');
    // The browser's own "Stop sharing", or a camera being unplugged.
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => void stop();
    });
    recorderRef.current = recorder;
    recorder.start(CHUNK_MS);
    startedRef.current = Date.now();
    setElapsed(0);
    setPhase('live');
    void refresh();
  }, [source, pump, refresh, releaseCapture, stop]);

  // The timer while on air.
  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Closing the tab goes off air. A beacon can only POST, so ingest takes ?stop=1.
  useEffect(() => {
    const onHide = (): void => {
      if (!sessionRef.current) return;
      navigator.sendBeacon?.('/api/live/ingest?stop=1');
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (sessionRef.current) {
        void fetch('/api/live/session', { method: 'DELETE', keepalive: true }).catch(() => undefined);
      }
      releaseCapture();
    };
  }, [releaseCapture]);

  const disconnect = useCallback(async () => {
    setError(null);
    await stop();
    try {
      const res = await fetch('/api/live/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      setNotice({ ok: true, text: 'c0mpute is disconnected.' });
    } catch {
      setError('Could not disconnect. Please try again.');
    }
    void refresh();
  }, [refresh, stop]);

  const copy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen to copy by hand.
    }
  }, []);

  const live = phase === 'live' || phase === 'stopping';
  const busy = phase === 'starting' || phase === 'stopping';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Go Live</h1>
        <p className="text-text-secondary max-w-xl mx-auto">
          Broadcast your own camera or screen to anyone with a link. The stream is carried by the c0mpute network and
          plays in any browser.
        </p>
      </div>

      {notice ? (
        <div
          className={cn(
            'p-3 rounded-lg border text-sm',
            notice.ok ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
          )}
        >
          {notice.text}
        </div>
      ) : null}
      {error ? <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">{error}</div> : null}
      {loadError ? <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">{loadError}</div> : null}

      {status === null && !loadError ? <div className={cn(card, 'text-center text-text-muted')}>Loading...</div> : null}

      {status && !status.connected ? (
        <div className={card}>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Connect c0mpute</h2>
          <p className="text-sm text-text-secondary mb-4">
            One time only. You approve BitTorrented to manage live streams on your c0mpute account, and nothing else on
            it. After that, going live is one click.
          </p>
          <fieldset className="mb-4 space-y-2">
            <legend className="text-sm font-medium text-text-secondary mb-2">Who can find your stream</legend>
            {(
              [
                ['unlisted', 'Unlisted', 'Only people you give the link to. It is not encrypted, so anyone with the link can watch.'],
                ['public', 'Public', 'Also listed on c0mpute.com/live while you are on air.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-3 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="mt-1"
                />
                <span>
                  <span className="text-text-primary font-medium">{label}</span>
                  <span className="block text-text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <a href={`/api/live/oauth/start?visibility=${visibility}`} className={cn(primary, 'w-full')}>
            Connect c0mpute
          </a>
          <p className="text-xs text-text-muted mt-3">
            No c0mpute account yet? You can make one on the way through. Streaming is free up to 720p and 25 viewers at
            once.
          </p>
        </div>
      ) : null}

      {status?.connected ? (
        <>
          <div className={card}>
            <div className={cn('relative aspect-video rounded-xl bg-bg-tertiary border border-border-subtle overflow-hidden', 'flex items-center justify-center')}>
              <video ref={previewRef} muted playsInline className={cn('w-full h-full', !live && phase !== 'starting' && 'hidden')} />
              {!live && phase !== 'starting' ? (
                <p className="text-text-muted text-sm p-8 text-center">Your preview shows here once you go live.</p>
              ) : null}
              {phase === 'live' ? (
                <span className="absolute top-3 left-3 rounded-sm bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  LIVE {formatElapsed(elapsed)}
                </span>
              ) : null}
            </div>

            {!supported ? (
              <p className="mt-4 text-sm text-red-500">
                This browser cannot record video for a live stream. Try a current Chrome, Edge or Firefox.
              </p>
            ) : null}

            {!live ? (
              <div className="mt-4 space-y-4">
                <div className="flex gap-2" role="radiogroup" aria-label="What to broadcast">
                  {(
                    [
                      ['camera', 'Camera'],
                      ['screen', 'Screen'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={source === value}
                      onClick={() => setSource(value)}
                      disabled={busy}
                      className={cn(
                        'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                        source === value
                          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                          : 'border-border-subtle bg-bg-tertiary text-text-secondary hover:text-text-primary'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => void goLive()} disabled={busy || !supported} className={cn(primary, 'w-full')}>
                  {phase === 'starting' ? 'Starting...' : 'Go live'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void stop()}
                disabled={phase === 'stopping'}
                className="mt-4 w-full rounded-lg px-4 py-3 font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {phase === 'stopping' ? 'Stopping...' : 'Stop stream'}
              </button>
            )}
          </div>

          {status.watchUrl ? (
            <div className={card}>
              <h2 className="font-semibold text-text-primary mb-1">Your watch link</h2>
              <p className="text-sm text-text-muted mb-3">
                {status.visibility === 'public'
                  ? 'Public: also listed on c0mpute.com/live while you are on air.'
                  : 'Unlisted: anyone with this link can watch.'}{' '}
                It is the same link every time you go live.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={status.watchUrl}
                  aria-label="Watch link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm font-mono text-text-primary"
                />
                <button type="button" onClick={() => void copy(status.watchUrl ?? '')} className={secondary}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a href={status.watchUrl} target="_blank" rel="noopener noreferrer" className={secondary}>
                  Open
                </a>
              </div>
              {status.playbackUrl ? (
                <p className="mt-2 text-xs text-text-muted break-all">For VLC or mpv: {status.playbackUrl}</p>
              ) : null}
            </div>
          ) : null}

          <div className={card}>
            <h2 className="font-semibold text-text-primary mb-2">What it costs</h2>
            <p className="text-sm text-text-secondary">
              Free up to 720p and 25 viewers at once. For more viewers, add balance on c0mpute: the nodes that carry
              your stream are paid $0.01 per GB from it.
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-sm">
              <span className="text-text-muted">
                Connected{status.accountLabel ? ` as ${status.accountLabel}` : ''} ·{' '}
                <a href="https://c0mpute.com/dashboard/live" target="_blank" rel="noopener noreferrer" className="underline">
                  balance and usage on c0mpute
                </a>
              </span>
              <button type="button" onClick={() => void disconnect()} disabled={busy} className={secondary}>
                Disconnect
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
