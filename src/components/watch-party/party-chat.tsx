'use client';

/**
 * The party's chat, which is the nixamp room's chat.
 *
 * One conversation for everybody in the party wherever they are: this page,
 * the nixamp app, a terminal, the desktop app, a television. Reading needs
 * nothing; the party code was the invitation. A line is signed with a nixamp
 * handle, so sending one takes the member's own nixamp connection, and the
 * box says so instead of pretending to send.
 *
 * Until the host puts the party on nixamp there is no room, so there is no
 * chat -- the panel says that too, rather than showing an input that goes
 * nowhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Focusable } from '@/components/ui/focusable';

interface ChatLine {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface PartyChatProps {
  partyCode: string;
  /** Is the party on nixamp? Null while that is still being asked. */
  bridged: boolean | null;
  isHost: boolean;
}

const POLL_EVERY_MS = 4_000;

export function PartyChat({ partyCode, bridged, isHost }: PartyChatProps): React.ReactElement {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectAt, setConnectAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastAt = useRef<string>('');
  const scroller = useRef<HTMLDivElement | null>(null);

  // Poll for what is new. `after` is the newest line's time, so a quiet room
  // costs one small request every few seconds and nothing is re-read.
  useEffect(() => {
    if (!bridged) return;
    let alive = true;
    const read = async (): Promise<void> => {
      try {
        const url = new URL('/api/watch-party/nixamp', window.location.origin);
        url.searchParams.set('code', partyCode);
        url.searchParams.set('chat', '1');
        if (lastAt.current) url.searchParams.set('after', lastAt.current);
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { messages?: ChatLine[] };
        const fresh = body.messages ?? [];
        if (!alive) return;
        setLoaded(true);
        if (fresh.length === 0) return;
        lastAt.current = fresh[fresh.length - 1]!.createdAt;
        setLines((known) => {
          const seen = new Set(known.map((l) => l.id));
          return [...known, ...fresh.filter((l) => !seen.has(l.id))].slice(-200);
        });
      } catch {
        // The room is slow; the next poll will say.
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [bridged, partyCode]);

  // Keep the newest line in view unless the reader has scrolled up to read.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }, [lines]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/watch-party/nixamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: partyCode, action: 'chat', body: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: ChatLine; error?: string; connect?: string };
      if (!res.ok) {
        setError(body.error ?? 'That did not send');
        setConnectAt(body.connect ?? null);
        return;
      }
      setDraft('');
      setConnectAt(null);
      if (body.message) {
        const line = body.message;
        lastAt.current = line.createdAt;
        setLines((known) => (known.some((l) => l.id === line.id) ? known : [...known, line]));
      }
    } catch {
      setError('That did not send');
    } finally {
      setSending(false);
    }
  }, [draft, sending, partyCode]);

  return (
    <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4 flex flex-col h-80">
      <h3 className="font-semibold text-text-primary mb-1">Chat</h3>
      <p className="text-xs text-text-muted mb-2">
        {bridged ? 'The nixamp room. Everybody in the party reads this, in every nixamp app.' : ''}
      </p>
      <div ref={scroller} className="flex-1 overflow-y-auto mb-3 space-y-2 text-sm" aria-live="polite">
        {bridged === false ? (
          <p className="text-text-muted text-center py-8">
            {isHost
              ? 'Put this party on nixamp and the chat opens here and in every nixamp app.'
              : 'Chat opens once the host puts this party on nixamp.'}
          </p>
        ) : null}
        {bridged && loaded && lines.length === 0 ? (
          <p className="text-text-muted text-center py-8">No messages yet. Say hi! 👋</p>
        ) : null}
        {lines.map((line) => (
          <div key={line.id} className="leading-snug">
            <span className="font-medium text-accent-primary mr-2">{line.authorName}</span>
            <span className="text-text-primary break-words">{line.body}</span>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!bridged || sending}
          maxLength={1000}
          placeholder={bridged ? 'Type a message...' : 'No room yet'}
          aria-label="Chat message"
          className={cn(
            'flex-1 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:border-accent-primary focus:outline-hidden',
            'disabled:opacity-50'
          )}
        />
        <Focusable as="button" onPress={() => void send()} className={cn('px-4 py-2 rounded-lg bg-accent-primary text-white text-sm', (!bridged || sending) && 'opacity-50')}>
          Send
        </Focusable>
      </form>
      {error ? (
        <p className="mt-2 text-xs text-red-500">
          {error}
          {connectAt ? (
            <>
              {' '}
              <a href={connectAt} className="underline">
                Connect nixamp to chat
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
