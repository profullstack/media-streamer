'use client';

/**
 * Watch Party
 *
 * Everybody at the same second. The host picks a file from the catalog and
 * their player is the clock: play, pause and seek go to the party, and every
 * other member's player follows within a couple of seconds. The party is also
 * a room on nixamp when the host has connected one, which is where the chat
 * lives and what lets somebody join from the nixamp app, a terminal, the
 * desktop app or a television.
 *
 * `/watch-party?code=ABC123` is the link the party is handed around by, and
 * the one nixamp sends its members to: it lands on the join form with the
 * code filled in, and joins on its own once there is a name to join as.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout';
import { MediaSelectionModal, NixampPanel, PartyChat } from '@/components/watch-party';
import { Focusable } from '@/components/ui/focusable';
import { cn } from '@/lib/utils';
import { PartyIcon, PlusIcon, UsersIcon } from '@/components/ui/icons';

interface PartyMember {
  id: string;
  name: string;
  isHost: boolean;
}

interface PartyData {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  mediaUrl: string;
  mediaTitle: string;
  state: 'waiting' | 'playing' | 'paused' | 'ended';
  memberCount: number;
  members?: PartyMember[];
  playback?: { isPlaying: boolean; currentTime: number; duration: number; lastUpdate: number };
  settings: {
    maxMembers: number;
    allowGuestControl: boolean;
    chatEnabled: boolean;
  };
}

interface TorrentItem {
  id: string;
  name: string;
  size: number;
  files_count: number;
  created_at: string;
}

interface FileItem {
  id: string;
  torrent_id: string;
  path: string;
  name: string;
  size: number;
  media_type: string;
  extension: string;
}

type ViewState = 'home' | 'create-form' | 'party-room';

/** Members poll the party this often; the host does too, to see who is in. */
const POLL_EVERY_MS = 3_000;
/** The host's player reports its position this often while playing. */
const HEARTBEAT_MS = 5_000;
/** A member further than this from the host is seeked. */
const DRIFT_SECONDS = 2;

const CODE_RE = /^[A-Z0-9]{6}$/;

/** Where the host's player is now, given what they last said and when. */
function expectedPosition(playback: NonNullable<PartyData['playback']>): number {
  if (!playback.isPlaying) return playback.currentTime;
  const since = (Date.now() - playback.lastUpdate) / 1000;
  return playback.currentTime + (Number.isFinite(since) && since > 0 ? since : 0);
}

export default function WatchPartyPage(): React.ReactElement {
  const [partyCode, setPartyCode] = useState('');
  const [hostName, setHostName] = useState('');
  const [userName, setUserName] = useState('');
  const [viewState, setViewState] = useState<ViewState>('home');
  const [party, setParty] = useState<PartyData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [nixampConnected, setNixampConnected] = useState(false);
  const [bridged, setBridged] = useState<boolean | null>(null);
  const [syncSignal, setSyncSignal] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);
  // Only the host's own player is a clock; everybody else's follows it.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // A seek we asked for must not be reported back as one the host made.
  const followingRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Who is here, so a name does not have to be typed: the nixamp handle when
  // one is connected (it is what the room shows anyway), else the account.
  useEffect(() => {
    let alive = true;
    void (async () => {
      let name = '';
      try {
        const res = await fetch('/api/v1/nixamp/connection', { cache: 'no-store' });
        if (res.ok) {
          const body = (await res.json()) as { connected?: boolean; account?: { handle?: string } };
          if (body.connected) {
            if (alive) setNixampConnected(true);
            name = body.account?.handle ?? '';
          }
        }
      } catch {
        // Not connected, as far as this page is concerned.
      }
      if (!name) {
        try {
          const res = await fetch('/api/auth/me', { cache: 'no-store' });
          if (res.ok) {
            const body = (await res.json()) as { user?: { displayName?: string; email?: string } };
            name = body.user?.displayName || (body.user?.email ?? '').split('@')[0] || '';
          }
        } catch {
          // Signed out: the form asks.
        }
      }
      if (alive && name) {
        setHostName((was) => was || name);
        setUserName((was) => was || name);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ?code=ABC123: the link a party is handed around by.
  const [linkedCode, setLinkedCode] = useState<string | null>(null);
  useEffect(() => {
    const code = (new URLSearchParams(window.location.search).get('code') ?? '').trim().toUpperCase();
    if (CODE_RE.test(code)) {
      setPartyCode(code);
      setLinkedCode(code);
    }
  }, []);

  const handleJoinParty = useCallback(async (code = partyCode, name = userName) => {
    if (!name.trim()) {
      setError('Please enter your name');
      nameInputRef.current?.focus();
      return;
    }
    if (!CODE_RE.test(code)) {
      setError('Please enter a valid 6-character party code');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/watch-party/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userName: name.trim() }),
      });
      const data = (await response.json()) as { success?: boolean; party?: PartyData; userId?: string; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Failed to join party');
      setParty(data.party ?? null);
      setUserId(data.userId ?? null);
      setViewState('party-room');
      window.history.replaceState(null, '', `/watch-party?code=${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join party');
    } finally {
      setIsLoading(false);
    }
  }, [partyCode, userName]);

  // A linked code joins on its own once there is a name to join as.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!linkedCode || autoJoined.current || viewState !== 'home') return;
    if (!userName.trim()) {
      nameInputRef.current?.focus();
      return;
    }
    autoJoined.current = true;
    void handleJoinParty(linkedCode, userName);
  }, [linkedCode, userName, viewState, handleJoinParty]);

  const handleCreateParty = useCallback(async () => {
    if (!hostName.trim()) {
      setError('Please enter your name');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/watch-party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: hostName.trim(), mediaTitle: 'Watch Party' }),
      });
      const data = (await response.json()) as { success?: boolean; party?: PartyData; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Failed to create party');
      setParty(data.party ?? null);
      setUserId(data.party?.hostId ?? null);
      setViewState('party-room');
      if (data.party?.code) window.history.replaceState(null, '', `/watch-party?code=${data.party.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create party');
    } finally {
      setIsLoading(false);
    }
  }, [hostName]);

  const handleLeaveParty = useCallback(() => {
    setParty(null);
    setUserId(null);
    setViewState('home');
    setPartyCode('');
    setLinkedCode(null);
    setBridged(null);
    setError(null);
    window.history.replaceState(null, '', '/watch-party');
  }, []);

  const isHost = party !== null && userId !== null && userId === party.hostId;

  // The host's player says where the film is.
  const report = useCallback(async (extra: { isPlaying?: boolean } = {}) => {
    const video = videoRef.current;
    if (!party || !isHost || !video) return;
    try {
      await fetch('/api/watch-party/playback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: party.code,
          hostId: userId,
          currentTime: video.currentTime,
          duration: Number.isFinite(video.duration) ? video.duration : undefined,
          isPlaying: extra.isPlaying ?? !video.paused,
        }),
      });
    } catch {
      // The next heartbeat says it again.
    }
  }, [party, isHost, userId]);

  const onHostEvent = useCallback((isPlaying?: boolean) => {
    void report(isPlaying === undefined ? {} : { isPlaying });
    setSyncSignal((n) => n + 1);
  }, [report]);

  useEffect(() => {
    if (!isHost || viewState !== 'party-room') return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused) void report();
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [isHost, viewState, report]);

  // Everybody polls the party: the member list for all, the film and the
  // second for the members. A party that is gone sends everybody home.
  useEffect(() => {
    if (viewState !== 'party-room' || !party) return;
    const code = party.code;
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/watch-party?code=${code}`, { cache: 'no-store' });
        if (!alive) return;
        if (res.status === 404 || res.status === 410) {
          handleLeaveParty();
          setError('That party has ended.');
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { party?: PartyData };
        if (data.party && alive) setParty(data.party);
      } catch {
        // Try again next tick.
      }
    };
    const timer = setInterval(() => void tick(), POLL_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [viewState, party?.code, handleLeaveParty]); // eslint-disable-line react-hooks/exhaustive-deps

  // A member's player follows the host's.
  useEffect(() => {
    if (isHost || !party?.playback || !party.mediaUrl) return;
    const video = videoRef.current;
    if (!video) return;
    const playback = party.playback;
    const target = expectedPosition(playback);
    if (Math.abs(video.currentTime - target) > DRIFT_SECONDS && Number.isFinite(target)) {
      followingRef.current = true;
      video.currentTime = target;
    }
    if (playback.isPlaying && video.paused) {
      video.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    } else if (!playback.isPlaying && !video.paused) {
      video.pause();
    }
  }, [party, isHost]);

  const handleMediaSelect = useCallback(async (file: FileItem, _torrent: TorrentItem) => {
    if (!party || !userId) return;
    try {
      const response = await fetch('/api/watch-party', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: party.code,
          hostId: userId,
          torrentId: file.torrent_id,
          filePath: file.path,
          mediaTitle: file.name,
        }),
      });
      const data = (await response.json()) as { success?: boolean; party?: PartyData; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Failed to update party media');
      setParty(data.party ?? null);
      setIsMediaModalOpen(false);
      setSyncSignal((n) => n + 1);
    } catch (err) {
      console.error('Failed to update party media:', err);
      setError(err instanceof Error ? err.message : 'Failed to update party media');
    }
  }, [party, userId]);

  const input = cn(
    'w-full rounded-lg border border-border-default bg-bg-tertiary px-4 py-3',
    'text-text-primary placeholder:text-text-muted',
    'focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary'
  );
  const primary = cn(
    'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
    'font-medium transition-colors bg-accent-primary text-white hover:bg-accent-primary/90'
  );

  // Party Room View
  if (viewState === 'party-room' && party) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-text-primary truncate">{party.mediaTitle}</h1>
              <p className="text-text-secondary">
                Party Code: <span className="font-mono font-bold text-accent-primary">{party.code}</span>
                {' · '}
                {party.memberCount} {party.memberCount === 1 ? 'member' : 'members'}
                {' · '}
                {isHost ? 'you are the host' : `hosted by ${party.hostName}`}
              </p>
            </div>
            <Focusable
              as="button"
              onPress={handleLeaveParty}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
            >
              Leave Party
            </Focusable>
          </div>

          {error ? (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">{error}</div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className={cn('relative aspect-video rounded-xl bg-bg-tertiary', 'flex items-center justify-center', 'border border-border-subtle')}>
                {party.mediaUrl ? (
                  <video
                    ref={videoRef}
                    src={party.mediaUrl}
                    controls
                    playsInline
                    className="w-full h-full rounded-xl"
                    onPlay={isHost ? () => onHostEvent(true) : undefined}
                    onPause={isHost ? () => onHostEvent(false) : undefined}
                    onSeeked={
                      isHost
                        ? () => onHostEvent()
                        : () => {
                            followingRef.current = false;
                          }
                    }
                  />
                ) : (
                  <div className="text-center p-8">
                    <div className="text-4xl mb-4">🎬</div>
                    <p className="text-text-secondary mb-2">No media selected</p>
                    {isHost ? (
                      <p className="text-sm text-text-muted">Select a file from the catalog to start watching</p>
                    ) : (
                      <p className="text-sm text-text-muted">Waiting for {party.hostName} to pick something</p>
                    )}
                  </div>
                )}
                {needsTap && !isHost ? (
                  <Focusable
                    as="button"
                    onPress={() => {
                      void videoRef.current?.play().then(() => setNeedsTap(false)).catch(() => undefined);
                    }}
                    className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-white text-lg font-medium"
                  >
                    ▶ Tap to join playback
                  </Focusable>
                ) : null}
              </div>

              {isHost ? (
                <div className="mt-4 p-4 rounded-lg bg-bg-secondary border border-border-subtle">
                  <p className="text-sm text-text-muted mb-2">Host Controls · your player is everybody&apos;s clock</p>
                  <div className="flex gap-2 flex-wrap">
                    <Focusable
                      as="button"
                      onPress={() => setIsMediaModalOpen(true)}
                      className="px-4 py-2 rounded-sm bg-accent-primary text-white text-sm hover:bg-accent-primary/90 transition-colors"
                    >
                      {party.mediaUrl ? 'Change Media' : 'Select Media'}
                    </Focusable>
                    <Focusable
                      as="button"
                      onPress={() => onHostEvent()}
                      className="px-4 py-2 rounded-sm bg-bg-tertiary text-text-primary text-sm"
                    >
                      Sync All
                    </Focusable>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <NixampPanel
                partyCode={party.code}
                isHost={isHost}
                mediaTitle={party.mediaTitle}
                autoBridge={nixampConnected}
                syncSignal={syncSignal}
                onRoom={setBridged}
                positionSeconds={
                  isHost
                    ? () => ({
                        positionSeconds: videoRef.current?.currentTime ?? 0,
                        playing: videoRef.current ? !videoRef.current.paused : false,
                      })
                    : undefined
                }
              />

              <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4">
                <h3 className="font-semibold text-text-primary mb-3">Members ({party.memberCount})</h3>
                <div className="space-y-2">
                  {party.members?.map((member) => (
                    <div key={member.id} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-text-primary">{member.name}</span>
                      {member.isHost ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-sm bg-accent-primary/20 text-accent-primary">Host</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {party.settings.chatEnabled !== false ? (
                <PartyChat partyCode={party.code} bridged={bridged} isHost={isHost} />
              ) : null}
            </div>
          </div>

          <div className="text-center p-6 rounded-xl bg-bg-secondary border border-border-subtle">
            <p className="text-text-secondary mb-2">Share this code with friends:</p>
            <p className="text-4xl font-mono font-bold text-accent-primary tracking-widest">{party.code}</p>
            <p className="mt-2 text-xs text-text-muted break-all">
              or the link {typeof window !== 'undefined' ? `${window.location.origin}/watch-party?code=${party.code}` : ''}
            </p>
          </div>

          {isHost ? (
            <MediaSelectionModal
              isOpen={isMediaModalOpen}
              onClose={() => setIsMediaModalOpen(false)}
              onSelect={(file, torrent) => void handleMediaSelect(file, torrent)}
            />
          ) : null}
        </div>
      </MainLayout>
    );
  }

  // Create Form View
  if (viewState === 'create-form') {
    return (
      <MainLayout>
        <div className="max-w-md mx-auto space-y-6">
          <Focusable as="button" onPress={() => setViewState('home')} className="text-text-secondary hover:text-text-primary transition-colors">
            ← Back
          </Focusable>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-2">Create Watch Party</h1>
            <p className="text-text-secondary">Enter your name to create a party</p>
          </div>

          {error ? (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">{error}</div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateParty();
            }}
          >
            <div>
              <label htmlFor="host-name" className="block text-sm font-medium text-text-secondary mb-2">
                Your Name
              </label>
              <input id="host-name" type="text" value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Enter your name" className={input} />
            </div>

            <Focusable
              as="button"
              onPress={() => void handleCreateParty()}
              className={cn(primary, (isLoading || !hostName.trim()) && 'opacity-50 cursor-not-allowed')}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <PartyIcon size={20} />
                  <span>Create Party</span>
                </>
              )}
            </Focusable>
          </form>
        </div>
      </MainLayout>
    );
  }

  // Home View
  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Watch Party</h1>
          <p className="text-text-secondary max-w-md mx-auto">
            Watch together with friends in perfect sync. Create a party or join an existing one.
            <span className="block mt-1 text-accent-primary font-medium">Also a room on nixamp: join from the app, a terminal or a TV.</span>
          </p>
        </div>

        {error ? (
          <div className="max-w-2xl mx-auto p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">{error}</div>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
          <div className={cn('rounded-xl border border-border-subtle bg-bg-secondary p-6', 'hover:border-accent-primary/50 transition-colors')}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-primary/10">
                <PlusIcon size={24} className="text-accent-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Create Party</h2>
                <p className="text-sm text-text-muted">Start a new watch party</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Create a party and share the code with friends. You control playback, everyone watches in sync.
            </p>
            <Focusable
              as="button"
              onPress={() => {
                setError(null);
                setViewState('create-form');
              }}
              className={primary}
            >
              <PartyIcon size={20} />
              <span>Create New Party</span>
            </Focusable>
          </div>

          <div className={cn('rounded-xl border border-border-subtle bg-bg-secondary p-6', 'hover:border-accent-primary/50 transition-colors', linkedCode && 'border-accent-secondary')}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-secondary/10">
                <UsersIcon size={24} className="text-accent-secondary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Join Party</h2>
                <p className="text-sm text-text-muted">{linkedCode ? `You were invited to ${linkedCode}` : 'Enter a party code'}</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              {linkedCode ? 'Tell the party your name and you are in.' : 'Got a party code? Enter it below to join your friends and watch together.'}
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleJoinParty();
              }}
            >
              <input
                ref={nameInputRef}
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                className={cn(input, 'py-2 text-sm')}
              />
              <input
                type="text"
                value={partyCode}
                onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
                placeholder="Enter party code"
                aria-label="Party code"
                maxLength={6}
                className={cn(input, 'text-center text-lg font-mono tracking-widest', 'placeholder:tracking-normal placeholder:font-sans')}
              />
              <Focusable
                as="button"
                onPress={() => void handleJoinParty()}
                className={cn(
                  'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors',
                  CODE_RE.test(partyCode) && userName.trim() && !isLoading
                    ? 'bg-accent-secondary text-white hover:bg-accent-secondary/90'
                    : 'bg-bg-tertiary text-text-muted'
                )}
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Joining...</span>
                  </>
                ) : (
                  <>
                    <UsersIcon size={20} />
                    <span>Join Party</span>
                  </>
                )}
              </Focusable>
            </form>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold text-text-primary mb-4 text-center">Features</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="text-center p-4">
              <div className="text-2xl mb-2">🎬</div>
              <h4 className="font-medium text-text-primary mb-1">Synced Playback</h4>
              <p className="text-sm text-text-muted">Everyone follows the host&apos;s player</p>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl mb-2">💬</div>
              <h4 className="font-medium text-text-primary mb-1">One Chat Everywhere</h4>
              <p className="text-sm text-text-muted">The nixamp room, in every nixamp app</p>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl mb-2">👥</div>
              <h4 className="font-medium text-text-primary mb-1">Up to 50 People</h4>
              <p className="text-sm text-text-muted">Invite all your friends</p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
