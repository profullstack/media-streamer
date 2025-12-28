'use client';

/**
 * Watch Party Page
 *
 * Synchronized streaming with real-time chat.
 * Free for anyone without requiring login.
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { PartyIcon, PlusIcon, UsersIcon } from '@/components/ui/icons';
import { MediaSelectionModal } from '@/components/watch-party';

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
  settings: {
    maxMembers: number;
    allowChat: boolean;
    hostOnlyControl: boolean;
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
        body: JSON.stringify({
          hostName: hostName.trim(),
          mediaTitle: 'Watch Party',
        }),
      });

      const data = await response.json() as { success?: boolean; party?: PartyData; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to create party');
      }

      setParty(data.party ?? null);
      setUserId(data.party?.hostId ?? null);
      setViewState('party-room');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create party');
    } finally {
      setIsLoading(false);
    }
  }, [hostName]);

  const handleJoinParty = useCallback(async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (partyCode.length !== 6) {
      setError('Please enter a valid 6-character party code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/watch-party/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: partyCode,
          userName: userName.trim(),
        }),
      });

      const data = await response.json() as { success?: boolean; party?: PartyData; userId?: string; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to join party');
      }

      setParty(data.party ?? null);
      setUserId(data.userId ?? null);
      setViewState('party-room');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join party');
    } finally {
      setIsLoading(false);
    }
  }, [partyCode, userName]);

  const handleLeaveParty = useCallback(() => {
    setParty(null);
    setUserId(null);
    setViewState('home');
    setPartyCode('');
    setHostName('');
    setUserName('');
    setError(null);
  }, []);

  const handleMediaSelect = useCallback(async (file: FileItem, torrent: TorrentItem) => {
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

      const data = await response.json() as { success?: boolean; party?: PartyData; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to update party media');
      }

      // Update local party state
      setParty(data.party ?? null);
      setIsMediaModalOpen(false);
    } catch (err) {
      console.error('Failed to update party media:', err);
      setError(err instanceof Error ? err.message : 'Failed to update party media');
    }
  }, [party, userId]);

  // Party Room View
  if (viewState === 'party-room' && party) {
    const isHost = userId === party.hostId;

    return (
      <MainLayout>
        <div className="space-y-6">
          {/* Party Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                {party.mediaTitle}
              </h1>
              <p className="text-text-secondary">
                Party Code: <span className="font-mono font-bold text-accent-primary">{party.code}</span>
                {' · '}
                {party.memberCount} {party.memberCount === 1 ? 'member' : 'members'}
              </p>
            </div>
            <button
              onClick={handleLeaveParty}
              className={cn(
                'px-4 py-2 rounded-lg',
                'bg-red-500/10 text-red-500 hover:bg-red-500/20',
                'transition-colors'
              )}
            >
              Leave Party
            </button>
          </div>

          {/* Main Content */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Video/Media Area */}
            <div className="lg:col-span-2">
              <div className={cn(
                'aspect-video rounded-xl bg-bg-tertiary',
                'flex items-center justify-center',
                'border border-border-subtle'
              )}>
                {party.mediaUrl ? (
                  <video
                    src={party.mediaUrl}
                    controls={isHost || !party.settings.hostOnlyControl}
                    className="w-full h-full rounded-xl"
                  />
                ) : (
                  <div className="text-center p-8">
                    <div className="text-4xl mb-4">🎬</div>
                    <p className="text-text-secondary mb-2">No media selected</p>
                    {isHost && (
                      <p className="text-sm text-text-muted">
                        Select a torrent from the catalog to start watching
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Playback Controls (Host Only) */}
              {isHost && (
                <div className="mt-4 p-4 rounded-lg bg-bg-secondary border border-border-subtle">
                  <p className="text-sm text-text-muted mb-2">Host Controls</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsMediaModalOpen(true)}
                      className="px-4 py-2 rounded bg-accent-primary text-white text-sm hover:bg-accent-primary/90 transition-colors"
                    >
                      Select Media
                    </button>
                    <button className="px-4 py-2 rounded bg-bg-tertiary text-text-primary text-sm">
                      Sync All
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Chat & Members Sidebar */}
            <div className="space-y-4">
              {/* Members List */}
              <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4">
                <h3 className="font-semibold text-text-primary mb-3">
                  Members ({party.memberCount})
                </h3>
                <div className="space-y-2">
                  {party.members?.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        'bg-green-500'
                      )} />
                      <span className="text-text-primary">{member.name}</span>
                      {member.isHost && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary">
                          Host
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat */}
              {party.settings.allowChat && (
                <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4 flex flex-col h-80">
                  <h3 className="font-semibold text-text-primary mb-3">Chat</h3>
                  <div className="flex-1 overflow-y-auto mb-3">
                    <p className="text-sm text-text-muted text-center py-8">
                      No messages yet. Say hi! 👋
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      className={cn(
                        'flex-1 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2',
                        'text-sm text-text-primary',
                        'placeholder:text-text-muted',
                        'focus:border-accent-primary focus:outline-none'
                      )}
                    />
                    <button className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm">
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Share Code */}
          <div className="text-center p-6 rounded-xl bg-bg-secondary border border-border-subtle">
            <p className="text-text-secondary mb-2">Share this code with friends:</p>
            <p className="text-4xl font-mono font-bold text-accent-primary tracking-widest">
              {party.code}
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Create Form View
  if (viewState === 'create-form') {
    return (
      <MainLayout>
        <div className="max-w-md mx-auto space-y-6">
          <button
            onClick={() => setViewState('home')}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Back
          </button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-2">Create Watch Party</h1>
            <p className="text-text-secondary">
              Enter your name to create a party
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Enter your name"
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-tertiary px-4 py-3',
                  'text-text-primary',
                  'placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
                )}
              />
            </div>

            <button
              onClick={handleCreateParty}
              disabled={isLoading || !hostName.trim()}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
                'font-medium transition-colors',
                isLoading || !hostName.trim()
                  ? 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                  : 'bg-accent-primary text-white hover:bg-accent-primary/90'
              )}
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
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Home View
  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Watch Party</h1>
          <p className="text-text-secondary max-w-md mx-auto">
            Watch together with friends in perfect sync. Create a party or join an existing one.
            <span className="block mt-1 text-accent-primary font-medium">No login required!</span>
          </p>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
          {/* Create Party */}
          <div className={cn(
            'rounded-xl border border-border-subtle bg-bg-secondary p-6',
            'hover:border-accent-primary/50 transition-colors'
          )}>
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
            <button
              onClick={() => {
                setError(null);
                setViewState('create-form');
              }}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
                'bg-accent-primary text-white font-medium',
                'hover:bg-accent-primary/90 transition-colors'
              )}
            >
              <PartyIcon size={20} />
              <span>Create New Party</span>
            </button>
          </div>

          {/* Join Party */}
          <div className={cn(
            'rounded-xl border border-border-subtle bg-bg-secondary p-6',
            'hover:border-accent-primary/50 transition-colors'
          )}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-secondary/10">
                <UsersIcon size={24} className="text-accent-secondary" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Join Party</h2>
                <p className="text-sm text-text-muted">Enter a party code</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Got a party code? Enter it below to join your friends and watch together.
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Your name"
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-tertiary px-4 py-2',
                  'text-sm text-text-primary',
                  'placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
                )}
              />
              <input
                type="text"
                value={partyCode}
                onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
                placeholder="Enter party code"
                maxLength={6}
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-tertiary px-4 py-3',
                  'text-center text-lg font-mono tracking-widest text-text-primary',
                  'placeholder:text-text-muted placeholder:tracking-normal placeholder:font-sans',
                  'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
                )}
              />
              <button
                onClick={handleJoinParty}
                disabled={partyCode.length !== 6 || !userName.trim() || isLoading}
                className={cn(
                  'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
                  'font-medium transition-colors',
                  partyCode.length === 6 && userName.trim() && !isLoading
                    ? 'bg-accent-secondary text-white hover:bg-accent-secondary/90'
                    : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
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
              </button>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold text-text-primary mb-4 text-center">Features</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="text-center p-4">
              <div className="text-2xl mb-2">🎬</div>
              <h4 className="font-medium text-text-primary mb-1">Synced Playback</h4>
              <p className="text-sm text-text-muted">Everyone watches at the same time</p>
            </div>
            <div className="text-center p-4">
              <div className="text-2xl mb-2">💬</div>
              <h4 className="font-medium text-text-primary mb-1">Live Chat</h4>
              <p className="text-sm text-text-muted">React and chat in real-time</p>
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
