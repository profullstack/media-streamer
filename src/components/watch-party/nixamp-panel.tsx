'use client';

/**
 * "Also on nixamp" — the watch party as a room every nixamp client can join.
 *
 * The film stays here. What goes to nixamp is the room: whoever is in it, the
 * chat, and the second the host's player is at. That is why the host sees a
 * Sync button and a member sees only a link — the position is the host's to
 * state, and everybody else's to follow.
 *
 * The panel is quiet until it has something to say. A party that is not
 * bridged and a viewer who is not the host get nothing at all rather than an
 * empty box explaining what could have been there.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface NixampPanelProps {
  partyCode: string;
  isHost: boolean;
  /** Where the host's own player is, asked for at the moment of a sync. */
  positionSeconds?: () => { positionSeconds: number; playing: boolean };
  mediaTitle?: string;
}

interface Room {
  nixampUrl: string;
  roomId: string;
  slug: string;
  site: string;
}

interface BridgeAnswer {
  bridged?: boolean;
  room?: Room;
  synced?: boolean;
  error?: string;
  /** Where to go when the answer is "connect nixamp first". */
  connect?: string;
}

/** How often the host's position is pushed while a bridged party is playing. */
const SYNC_EVERY_MS = 15_000;

export function NixampPanel({ partyCode, isHost, positionSeconds, mediaTitle }: NixampPanelProps): React.ReactElement | null {
  const [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectAt, setConnectAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Held in a ref so the interval below always reads the current getter
  // without being torn down and rebuilt every time the player ticks. Written
  // in an effect rather than during render: a ref touched while rendering is
  // a value React is free to have already read.
  const positionRef = useRef(positionSeconds);
  useEffect(() => {
    positionRef.current = positionSeconds;
  }, [positionSeconds]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/watch-party/nixamp?code=${encodeURIComponent(partyCode)}`);
        const body = (await res.json()) as BridgeAnswer;
        if (alive && body.bridged && body.room) setRoom(body.room);
      } catch {
        // Not bridged, as far as anybody here is concerned.
      }
    })();
    return () => {
      alive = false;
    };
  }, [partyCode]);

  const post = useCallback(
    async (payload: Record<string, unknown>): Promise<BridgeAnswer | null> => {
      const res = await fetch('/api/watch-party/nixamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: partyCode, ...payload }),
      });
      const body = (await res.json().catch(() => ({}))) as BridgeAnswer;
      if (!res.ok) {
        setError(body.error ?? 'nixamp would not answer');
        setConnectAt(body.connect ?? null);
        return null;
      }
      setError(null);
      setConnectAt(null);
      return body;
    },
    [partyCode]
  );

  const bridge = useCallback(async () => {
    setBusy(true);
    try {
      const body = await post({ action: 'bridge', ...(mediaTitle ? { mediaTitle, title: mediaTitle } : {}) });
      if (body?.room) setRoom(body.room);
    } finally {
      setBusy(false);
    }
  }, [post, mediaTitle]);

  const sync = useCallback(async () => {
    const where = positionRef.current?.();
    await post({ action: 'sync', ...(where ?? {}) });
  }, [post]);

  // While a host holds a bridged party, the position goes over on its own.
  // Somebody opening the room from a terminal an hour in should land an hour
  // in, and asking the host to press a button for that would not happen.
  useEffect(() => {
    if (!room || !isHost || !positionRef.current) return;
    const timer = setInterval(() => void sync(), SYNC_EVERY_MS);
    return () => clearInterval(timer);
  }, [room, isHost, sync]);

  const copy = useCallback(() => {
    if (!room) return;
    void navigator.clipboard?.writeText(room.nixampUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setError('could not copy that')
    );
  }, [room]);

  // Nothing to show and nothing to offer.
  if (!room && !isHost) return null;

  return (
    <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4">
      <h3 className="font-semibold text-text-primary mb-1">Also on nixamp</h3>
      <p className="text-xs text-text-muted mb-3">
        {room
          ? 'This party is a nixamp room. The film plays here; the room is open in every nixamp client.'
          : 'Put this party on nixamp and it becomes a room people can join from the nixamp app, a terminal or a TV.'}
      </p>

      {room ? (
        <div className="space-y-2">
          <a
            href={room.nixampUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-accent-primary break-all hover:underline"
          >
            {room.nixampUrl}
          </a>
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="px-3 py-1.5 rounded-sm bg-bg-tertiary text-text-primary text-sm hover:bg-bg-tertiary/80 transition-colors"
            >
              {copied ? 'Copied' : 'Copy room link'}
            </button>
            {isHost && positionSeconds ? (
              <button
                onClick={() => void sync()}
                className="px-3 py-1.5 rounded-sm bg-accent-primary text-white text-sm hover:bg-accent-primary/90 transition-colors"
              >
                Sync nixamp
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          onClick={() => void bridge()}
          disabled={busy}
          className={cn(
            'px-4 py-2 rounded-sm bg-accent-primary text-white text-sm',
            'hover:bg-accent-primary/90 transition-colors',
            busy && 'opacity-50 cursor-not-allowed'
          )}
        >
          {busy ? 'Asking nixamp…' : 'Put this party on nixamp'}
        </button>
      )}

      {error ? (
        <p className="mt-2 text-xs text-red-500">
          {error}
          {connectAt ? (
            <>
              {' '}
              <a href={connectAt} className="underline">
                Connect nixamp
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
