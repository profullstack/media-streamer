'use client';

/**
 * Public rent flow: pay $0.25 → add a magnet → watch progress → play.
 *
 * The session-pass cookie is set (httpOnly) at checkout and becomes usable once
 * the CoinPay webhook confirms payment, so this component just polls the grant
 * status after returning from checkout, then talks to the pass-gated endpoints.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface PublicShare {
  slug: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  maxDownloadsPerPass: number;
  active: boolean;
}

interface DownloadProgress {
  id: string;
  infohash: string;
  name: string | null;
  status: 'added' | 'downloading' | 'complete' | 'error';
  progress: number;
  peers: number;
  speed: number;
  ready: boolean;
}

interface PlayableFile {
  path: string;
  name: string;
  kind: 'video' | 'audio';
}

function fmtSpeed(bytesPerSec: number): string {
  if (!bytesPerSec) return '';
  const mb = bytesPerSec / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export function RentClient({ slug }: { slug: string }): React.ReactElement {
  const [share, setShare] = useState<PublicShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPass, setHasPass] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const [isOwner, setIsOwner] = useState(false);
  const [magnet, setMagnet] = useState('');
  const [adding, setAdding] = useState(false);
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);
  const [maxDownloads, setMaxDownloads] = useState(2);
  const [filesByDownload, setFilesByDownload] = useState<Record<string, PlayableFile[]>>({});
  const [playing, setPlaying] = useState<PlayableFile | null>(null);

  const streamBase = `/api/public/shares/${slug}`;

  // --- Load metadata + detect an existing valid pass ---
  const loadDownloads = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`${streamBase}/downloads`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setDownloads(data.downloads ?? []);
      setMaxDownloads(data.maxDownloads ?? 2);
      return true;
    }
    return false;
  }, [streamBase]);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const res = await fetch(streamBase, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setError('This rental link is not available.');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setShare(data.share);
        // Owners use their own seedbox free: mint a pass instead of paywalling.
        if (data.isOwner) {
          setIsOwner(true);
          await fetch(`${streamBase}/owner-pass`, { method: 'POST' }).catch(() => null);
        }
        const paid = await loadDownloads();
        if (!cancelled) setHasPass(paid);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamBase, loadDownloads]);

  // --- After returning from CoinPay (?grant=...), poll until paid ---
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (hasPass) return;
    const grantId = new URLSearchParams(window.location.search).get('grant');
    if (!grantId) return;
    setAwaitingPayment(true);
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 4;
      const res = await fetch(`${streamBase}/grant/${grantId}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'paid') {
          setHasPass(true);
          setAwaitingPayment(false);
          await loadDownloads();
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
      if (elapsed > 600 && pollRef.current) {
        clearInterval(pollRef.current);
        setAwaitingPayment(false);
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasPass, streamBase, loadDownloads]);

  // --- Poll downloads while we hold a pass ---
  useEffect(() => {
    if (!hasPass) return;
    const t = setInterval(() => {
      void loadDownloads();
    }, 5000);
    return () => clearInterval(t);
  }, [hasPass, loadDownloads]);

  // --- Fetch playable files when a download completes ---
  useEffect(() => {
    downloads
      .filter((d) => d.ready && !filesByDownload[d.id])
      .forEach(async (d) => {
        const res = await fetch(`${streamBase}/downloads/${d.id}/files`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setFilesByDownload((prev) => ({ ...prev, [d.id]: data.files ?? [] }));
        }
      });
  }, [downloads, filesByDownload, streamBase]);

  const pay = useCallback(async (): Promise<void> => {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`${streamBase}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start checkout.');
        return;
      }
      window.location.href = data.paymentUrl;
    } finally {
      setPaying(false);
    }
  }, [streamBase]);

  const addMagnet = useCallback(async (): Promise<void> => {
    if (!magnet.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`${streamBase}/downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: magnet.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not add that magnet.');
        return;
      }
      setMagnet('');
      await loadDownloads();
    } finally {
      setAdding(false);
    }
  }, [magnet, streamBase, loadDownloads]);

  if (loading) {
    return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-text-secondary">Loading…</main>;
  }
  if (error && !share) {
    return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-red-500">{error}</main>;
  }
  if (!share) return <main className="px-4 py-16" />;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">{share.title}</h1>
        {share.description ? <p className="mt-2 text-text-secondary">{share.description}</p> : null}
      </header>

      {error ? <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {error}
        </div> : null}

      {!hasPass && (
        <section className="rounded-lg border border-border bg-bg-secondary p-6 text-center">
          {!share.active ? (
            <p className="text-text-secondary">This rental is not currently available.</p>
          ) : awaitingPayment ? (
            <p className="text-text-secondary">Waiting for your payment to confirm…</p>
          ) : (
            <>
              <p className="text-text-secondary">
                Pay once to unlock a{' '}
                <span className="font-medium text-text-primary">
                  {Math.round(share.passWindowMinutes / 60)}-hour
                </span>{' '}
                session. Add up to{' '}
                <span className="font-medium text-text-primary">{share.maxDownloadsPerPass}</span>{' '}
                torrent{share.maxDownloadsPerPass === 1 ? '' : 's'} and stream them here.
              </p>
              <button
                className="mt-4 rounded-md bg-accent-primary px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                onClick={() => void pay()}
                disabled={paying}
              >
                {paying ? 'Starting…' : `Pay $${share.priceUsd.toFixed(2)} to start`}
              </button>
              <p className="mt-3 text-xs text-text-tertiary">Paid in crypto via CoinPay.</p>
            </>
          )}
        </section>
      )}

      {hasPass ? <section className="flex flex-col gap-5">
          {isOwner ? <div className="rounded-md border border-accent-primary/30 bg-accent-primary/5 px-4 py-2 text-sm text-text-secondary">
              This is your rental — you’re using it free as the owner. Visitors pay $
              {share.priceUsd.toFixed(2)}.
            </div> : null}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Paste a magnet link ({downloads.length}/{maxDownloads} used)
            </label>
            <div className="flex gap-2">
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
                placeholder="magnet:?xt=urn:btih:…"
                value={magnet}
                onChange={(e) => setMagnet(e.target.value)}
              />
              <button
                className="shrink-0 rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                onClick={() => void addMagnet()}
                disabled={adding || downloads.length >= maxDownloads}
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>

          {playing ? <div className="overflow-hidden rounded-lg border border-border bg-black">
              {playing.kind === 'audio' ? (
                <audio
                  className="w-full"
                  controls
                  autoPlay
                  src={`${streamBase}/stream?path=${encodeURIComponent(playing.path)}`}
                />
              ) : (
                <video
                  className="aspect-video w-full"
                  controls
                  autoPlay
                  playsInline
                  src={`${streamBase}/stream?path=${encodeURIComponent(playing.path)}`}
                />
              )}
              <button
                className="w-full bg-bg-secondary px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
                onClick={() => setPlaying(null)}
              >
                Close player
              </button>
            </div> : null}

          <div className="flex flex-col gap-3">
            {downloads.length === 0 && (
              <p className="text-sm text-text-secondary">No downloads yet — add a magnet above.</p>
            )}
            {downloads.map((d) => (
              <div key={d.id} className="rounded-lg border border-border bg-bg-secondary p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-text-primary">
                    {d.name ?? d.infohash.slice(0, 12)}
                  </span>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {d.ready ? 'Ready' : `${Math.round(d.progress)}%`}
                    {!d.ready && d.speed ? ` · ${fmtSpeed(d.speed)}` : ''}
                  </span>
                </div>
                {!d.ready && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-hover">
                    <div
                      className="h-full bg-accent-primary transition-all"
                      style={{ width: `${Math.max(2, d.progress)}%` }}
                    />
                  </div>
                )}
                {d.ready ? <div className="mt-3 flex flex-col gap-1">
                    {(filesByDownload[d.id] ?? []).length === 0 && (
                      <span className="text-xs text-text-tertiary">Finding playable files…</span>
                    )}
                    {(filesByDownload[d.id] ?? []).map((f) => (
                      <button
                        key={f.path}
                        className="flex items-center justify-between rounded px-2 py-1 text-left text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                        onClick={() => setPlaying(f)}
                      >
                        <span className="min-w-0 truncate">{f.name}</span>
                        <span className="ml-2 shrink-0 text-xs text-accent-primary">Play ▶</span>
                      </button>
                    ))}
                  </div> : null}
              </div>
            ))}
          </div>
        </section> : null}
    </main>
  );
}
