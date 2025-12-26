'use client';

/**
 * Watch Party Page
 * 
 * Synchronized streaming with real-time chat.
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { PartyIcon, PlusIcon, UsersIcon } from '@/components/ui/icons';

export default function WatchPartyPage(): React.ReactElement {
  const [partyCode, setPartyCode] = useState('');

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Watch Party</h1>
          <p className="text-text-secondary max-w-md mx-auto">
            Watch together with friends in perfect sync. Create a party or join an existing one.
          </p>
        </div>

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
                disabled={partyCode.length !== 6}
                className={cn(
                  'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
                  'font-medium transition-colors',
                  partyCode.length === 6
                    ? 'bg-accent-secondary text-white hover:bg-accent-secondary/90'
                    : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                )}
              >
                <UsersIcon size={20} />
                <span>Join Party</span>
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
