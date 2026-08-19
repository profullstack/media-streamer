'use client';

/**
 * Public IPTV resale flow: buy a pass → pick a channel → watch.
 *
 * Two things shape this component.
 *
 * The pass cookie is httpOnly and set at checkout, but grants nothing until the
 * CoinPayPortal webhook confirms payment — so after returning from checkout we
 * poll the channel list, which is the first pass-gated endpoint, rather than
 * trusting the redirect.
 *
 * And the stream is addressed by an opaque session id. The channel list carries no
 * URLs at all; the owner's provider credentials stay server-side. That is also why
 * this uses hls.js directly instead of the shared player modal, which would re-wrap
 * the URL through the generic IPTV proxy and undo the protection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface PublicShare {
  slug: string;
  kind?: 'iptv' | 'radio';
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  channelCount: number;
  active: boolean;
  capacityAvailable: boolean;
}

interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
}

const btn =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50';

/** The player heartbeats so a closed tab frees its slot instead of holding it. */
const HEARTBEAT_MS = 30_000;

export function WatchClient({ slug }: { slug: string }): React.ReactElement {
  const [share, setShare] = useState<PublicShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hasPass, setHasPass] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [paying, setPaying] = useState(false);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [filter, setFilter] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [session, setSession] = useState<{ id: string; url: string; name: string | null } | null>(
    null,
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const base = `/api/public/iptv/${slug}`;

  /** The channel list is pass-gated, so a 200 here IS proof of a live pass. */
  const loadChannels = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`${base}/channels`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    setChannels(data.channels ?? []);
    setHasPass(true);
    return true;
  }, [base]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(base, { cache: 'no-store' });
        if (!res.ok) throw new Error('This listing is not available.');
        const data = await res.json();
        if (cancelled) return;
        setShare(data.share);
        await loadChannels();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, loadChannels]);

  /**
   * After checkout the webhook may not have landed yet, so poll rather than
   * assume. Bounded: a payment that never confirms must not poll forever.
   */
  useEffect(() => {
    if (!awaitingPayment) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      if (await loadChannels()) {
        setAwaitingPayment(false);
        clearInterval(id);
      } else if (tries > 60) {
        setAwaitingPayment(false);
        setError('Payment has not confirmed yet. Refresh once it does.');
        clearInterval(id);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [awaitingPayment, loadChannels]);

  async function buy(): Promise<void> {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`${base}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout.');
      setAwaitingPayment(true);
      window.location.href = data.paymentUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  }

  async function play(channel: Channel): Promise<void> {
    setStarting(channel.id);
    setError(null);
    try {
      const res = await fetch(`${base}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: channel.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start that stream.');
      setSession({ id: data.sessionId, url: data.streamUrl, name: data.channelName ?? channel.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(null);
    }
  }

  async function stop(): Promise<void> {
    if (!session) return;
    await fetch(`${base}/session?session=${encodeURIComponent(session.id)}`, {
      method: 'DELETE',
    }).catch(() => {});
    setSession(null);
  }

  // Attach hls.js to the opaque session URL, and keep the slot alive.
  useEffect(() => {
    if (!session || !videoRef.current) return;
    const video = videoRef.current;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = session.url;
      } else {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (Hls.isSupported()) {
          const instance = new Hls({ enableWorker: true });
          instance.loadSource(session.url);
          instance.attachMedia(video);
          hls = instance;
        } else {
          setError('This browser cannot play this stream.');
        }
      }
      video.play().catch(() => {});
    })();

    const beat = setInterval(() => {
      fetch(`${base}/session`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      }).catch(() => {});
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(beat);
      hls?.destroy();
    };
  }, [session, base]);

  // A closed tab must release the slot; without this the line looks full.
  useEffect(() => {
    if (!session) return;
    const release = (): void => {
      navigator.sendBeacon?.(`${base}/session?session=${encodeURIComponent(session.id)}`);
    };
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, [session, base]);

  if (loading) return <main className="p-8 text-text-secondary">Loading…</main>;
  if (!share) {
    return <main className="p-8 text-text-secondary">{error ?? 'Listing not found.'}</main>;
  }

  const visible = filter
    ? channels.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
    : channels;

  // Radio is the same flow with a different noun and a much shorter player. The
  // stream is still HLS, so the media element and hls.js path are unchanged.
  const radio = share.kind === 'radio';
  const noun = radio ? 'stations' : 'channels';
  const verb = radio ? 'Listen' : 'Watch';

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">{share.title}</h1>
      {share.description ? (
        <p className="mt-1 text-sm text-text-secondary">{share.description}</p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      ) : null}

      {!hasPass ? (
        <section className="mt-6 rounded-lg border border-border p-5">
          <p className="text-sm text-text-secondary">
            {share.channelCount} {share.kind === 'radio' ? 'stations' : 'channels'} · access for{' '}
            {share.passWindowMinutes >= 1440
              ? `${Math.round(share.passWindowMinutes / 1440)} day`
              : `${Math.round(share.passWindowMinutes / 60)} hours`}
          </p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">
            ${share.priceUsd.toFixed(2)}
          </p>

          {!share.active ? (
            <p className="mt-3 text-sm text-text-tertiary">This listing is not currently available.</p>
          ) : !share.capacityAvailable ? (
            // Said before payment on purpose: selling a pass that cannot start a
            // stream is the fastest way to owe a refund.
            <p className="mt-3 text-sm text-yellow-500">
              Every stream on this line is in use right now. Try again shortly.
            </p>
          ) : (
            <button
              type="button"
              onClick={buy}
              disabled={paying || awaitingPayment}
              className={`${btn} mt-4 bg-accent-primary text-white`}
            >
              {awaitingPayment ? 'Waiting for payment…' : paying ? 'Starting…' : 'Buy access'}
            </button>
          )}
        </section>
      ) : session ? (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-primary">{session.name}</h2>
            <button type="button" onClick={stop} className={`${btn} border border-border`}>
              Back to channels
            </button>
          </div>
          {/* biome-ignore lint/a11y/useMediaCaption: live TV and radio have no caption track */}
          <video
            ref={videoRef}
            controls
            playsInline
            className={
              radio
                ? 'mt-3 h-16 w-full rounded-lg bg-black'
                : 'mt-3 aspect-video w-full rounded-lg bg-black'
            }
          />
          {radio ? (
            <p className="mt-2 text-xs text-text-tertiary">
              Streamed from the owner&apos;s line. Everyone on this station shares one
              connection upstream.
            </p>
          ) : null}
        </section>
      ) : (
        <section className="mt-6">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${channels.length} ${noun}`}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary"
          />
          <ul className="mt-3 divide-y divide-border">
            {visible.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                {c.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logo} alt="" width={28} height={28} className="rounded" />
                ) : (
                  <span className="h-7 w-7 rounded bg-border" />
                )}
                <span className="flex-1 text-sm text-text-primary">{c.name}</span>
                <button
                  type="button"
                  onClick={() => play(c)}
                  disabled={starting === c.id}
                  className={`${btn} border border-border`}
                >
                  {starting === c.id ? 'Starting…' : verb}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
