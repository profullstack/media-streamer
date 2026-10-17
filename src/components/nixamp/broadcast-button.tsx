'use client';

/**
 * Broadcast with Nixamp: send this torrent's audio to one of the member's own
 * Nixamp servers, where it is copied and made into a private station draft.
 *
 * Everything that matters happens on the server (src/lib/nixamp/handoff.ts):
 * the token only ever goes to a server nixamp.com says is theirs, and each
 * file travels by a one-file grant. This is the dialog around it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TorrentFile } from '@/types';
import { RadioIcon } from '@/components/ui/icons';

interface Host {
  id: string;
  name: string;
  url: string;
}

interface Progress {
  id: string;
  status: string;
  stationId: string;
  counts: Record<string, number>;
}

type Phase =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'not-connected' }
  | { kind: 'reconnect' }
  | { kind: 'choose'; hosts: Host[] }
  | { kind: 'sending' }
  | { kind: 'sent'; host: Host; progress: Progress }
  | { kind: 'error'; message: string };

export function BroadcastWithNixampButton({ torrentId, torrentName, audioFiles }: { torrentId: string; torrentName: string; audioFiles: TorrentFile[] }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [host, setHost] = useState('');
  const [name, setName] = useState(torrentName);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(audioFiles.map((file) => file.id)));
  const dialog = useRef<HTMLDialogElement>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const close = useCallback(() => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    dialog.current?.close();
    setPhase({ kind: 'closed' });
  }, []);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const open = useCallback(async () => {
    dialog.current?.showModal();
    setPhase({ kind: 'loading' });
    const response = await fetch('/api/v1/nixamp/hosts');
    const body = (await response.json().catch(() => ({}))) as { hosts?: Host[]; code?: string; error?: string };
    if (body.code === 'not_connected') return setPhase({ kind: 'not-connected' });
    if (body.code === 'reconnect_required') return setPhase({ kind: 'reconnect' });
    if (!response.ok) return setPhase({ kind: 'error', message: body.error ?? 'Could not reach nixamp.com.' });
    const hosts = body.hosts ?? [];
    setHost(hosts[0]?.url ?? '');
    setPhase({ kind: 'choose', hosts });
  }, []);

  const send = useCallback(async () => {
    const hosts = phase.kind === 'choose' ? phase.hosts : [];
    const target = hosts.find((one) => one.url === host);
    if (!target) return;
    setPhase({ kind: 'sending' });
    const response = await fetch('/api/v1/nixamp/handoffs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host: target.url, torrentId, fileIds: [...chosen], name }),
    });
    const body = (await response.json().catch(() => ({}))) as { handoff?: Progress; error?: string; code?: string };
    if (!response.ok || !body.handoff) {
      return setPhase({ kind: 'error', message: body.error ?? `Your Nixamp server answered ${response.status}.` });
    }
    setPhase({ kind: 'sent', host: target, progress: body.handoff });
    const id = body.handoff.id;
    poll.current = setInterval(async () => {
      const status = await fetch(`/api/v1/nixamp/handoffs?${new URLSearchParams({ host: target.url, id })}`);
      const next = (await status.json().catch(() => ({}))) as { handoff?: Progress };
      if (next.handoff) {
        setPhase({ kind: 'sent', host: target, progress: next.handoff });
        if (next.handoff.status !== 'importing' && poll.current) {
          clearInterval(poll.current);
          poll.current = null;
        }
      }
    }, 3000);
  }, [phase, host, torrentId, chosen, name]);

  if (audioFiles.length === 0) return null;
  const here = typeof window === 'undefined' ? '/' : window.location.pathname;

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        className="flex items-center gap-2 rounded-full border border-accent-audio/40 px-4 py-1.5 text-sm font-medium text-accent-audio hover:bg-accent-audio/10 transition-colors"
        title="Send these files to your own Nixamp server and make a station from them"
      >
        <RadioIcon size={14} />
        <span>Broadcast with Nixamp</span>
      </button>
      <dialog
        ref={dialog}
        onClose={close}
        aria-labelledby="nixamp-broadcast-title"
        className="w-[min(560px,calc(100vw-32px))] rounded-xl border border-border-subtle bg-bg-secondary p-0 text-text-primary backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id="nixamp-broadcast-title" className="text-lg font-semibold">Broadcast with Nixamp</h2>
          {phase.kind === 'loading' ? <p className="text-sm text-text-muted">Asking nixamp.com for your servers…</p> : null}
          {phase.kind === 'not-connected' ? (
            <p className="text-sm">Connect your nixamp account first, in <a className="text-accent-primary underline" href="/settings?tab=connections">Settings → Connections</a>.</p>
          ) : null}
          {phase.kind === 'reconnect' ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>Your nixamp connection was made before stations existed. Reconnect it once to send music to your server.</p>
              <a className="self-start rounded-full bg-accent-primary px-4 py-1.5 font-medium text-white" href={`/api/v1/nixamp/oauth/start?redirect=${encodeURIComponent(here)}`}>Reconnect nixamp</a>
            </div>
          ) : null}
          {phase.kind === 'choose' && phase.hosts.length === 0 ? (
            <p className="text-sm">nixamp.com does not know of a server you run yet. Start one with <code>nixamp daemon start</code> while signed in, and it is added.</p>
          ) : null}
          {phase.kind === 'choose' && phase.hosts.length > 0 ? (
            <form className="flex flex-col gap-3 text-sm" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label className="flex flex-col gap-1">Server
                <select className="rounded-md border border-border-subtle bg-bg-primary px-2 py-1.5" value={host} onChange={(event) => setHost(event.target.value)}>
                  {phase.hosts.map((one) => <option key={one.url} value={one.url}>{one.name} ({new URL(one.url).host})</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">Station name
                <input className="rounded-md border border-border-subtle bg-bg-primary px-2 py-1.5" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required />
              </label>
              <fieldset className="max-h-56 overflow-auto rounded-md border border-border-subtle p-2">
                <legend className="px-1 text-text-muted">{chosen.size} of {audioFiles.length} files</legend>
                {audioFiles.map((file) => (
                  <label key={file.id} className="flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={chosen.has(file.id)}
                      onChange={(event) => {
                        const next = new Set(chosen);
                        if (event.target.checked) next.add(file.id); else next.delete(file.id);
                        setChosen(next);
                      }}
                    />
                    <span className="truncate">{file.name}</span>
                  </label>
                ))}
              </fieldset>
              <p className="text-text-muted">Your server copies these files and makes a private, stopped station. You start it, and decide who can listen, on your server. Only send music you have the right to broadcast.</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className="rounded-full px-4 py-1.5 text-text-muted hover:text-text-primary">Cancel</button>
                <button type="submit" disabled={chosen.size === 0} className="rounded-full bg-accent-audio px-4 py-1.5 font-medium text-white disabled:opacity-50">Send {chosen.size} files</button>
              </div>
            </form>
          ) : null}
          {phase.kind === 'sending' ? <p className="text-sm text-text-muted">Handing the files over…</p> : null}
          {phase.kind === 'sent' ? (
            <div className="flex flex-col gap-2 text-sm" aria-live="polite">
              <p>
                {phase.progress.status === 'importing' ? 'Your server is copying the files.' : phase.progress.status === 'ready' ? 'All copied. The station is ready to start.' : 'Done, with some files that did not come over.'}
              </p>
              <p className="text-text-muted">
                {Object.entries(phase.progress.counts).map(([state, count]) => `${count} ${state}`).join(' · ')}
              </p>
              <a className="self-start rounded-full bg-accent-primary px-4 py-1.5 font-medium text-white" href={`${phase.host.url}/radio#stations`} target="_blank" rel="noopener noreferrer">Open your stations</a>
            </div>
          ) : null}
          {phase.kind === 'error' ? <p role="alert" className="text-sm text-red-400">{phase.message}</p> : null}
          {phase.kind !== 'choose' ? (
            <div className="flex justify-end"><button type="button" onClick={close} className="rounded-full px-4 py-1.5 text-text-muted hover:text-text-primary">Close</button></div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
