'use client';

/**
 * Settings Page
 * 
 * User settings and preferences.
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { SettingsIcon, UserIcon, TvIcon, VideoIcon } from '@/components/ui/icons';

type SettingsTab = 'account' | 'playback' | 'iptv';

export default function SettingsPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [transcodingEnabled, setTranscodingEnabled] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [quality, setQuality] = useState('auto');

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: UserIcon },
    { id: 'playback' as const, label: 'Playback', icon: VideoIcon },
    { id: 'iptv' as const, label: 'IPTV', icon: TvIcon },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <SettingsIcon size={28} className="text-text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Tabs */}
          <nav className="flex lg:flex-col gap-2 lg:w-48">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  )}
                >
                  <Icon size={20} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 rounded-xl border border-border-subtle bg-bg-secondary p-6">
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary mb-4">Account Settings</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        disabled
                        value="user@example.com"
                        className={cn(
                          'w-full max-w-md rounded-lg border border-border-default bg-bg-tertiary px-4 py-2',
                          'text-text-muted cursor-not-allowed'
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Subscription
                      </label>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-accent-primary/10 px-3 py-1 text-sm font-medium text-accent-primary">
                          Free Plan
                        </span>
                        <a href="/pricing" className="text-sm text-accent-primary hover:underline">
                          Upgrade
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border-subtle pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Danger Zone</h3>
                  <button
                    className={cn(
                      'rounded-lg border border-status-error px-4 py-2',
                      'text-sm font-medium text-status-error',
                      'hover:bg-status-error/10 transition-colors'
                    )}
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'playback' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">Playback Settings</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">Autoplay</h3>
                      <p className="text-sm text-text-muted">Automatically play next file</p>
                    </div>
                    <button
                      onClick={() => setAutoplay(!autoplay)}
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        autoplay ? 'bg-accent-primary' : 'bg-bg-tertiary'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          autoplay ? 'left-[22px]' : 'left-0.5'
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">Server Transcoding</h3>
                      <p className="text-sm text-text-muted">Convert unsupported formats on server</p>
                    </div>
                    <button
                      onClick={() => setTranscodingEnabled(!transcodingEnabled)}
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        transcodingEnabled ? 'bg-accent-primary' : 'bg-bg-tertiary'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                          transcodingEnabled ? 'left-[22px]' : 'left-0.5'
                        )}
                      />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-text-primary mb-2">Default Quality</h3>
                    <select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      className={cn(
                        'rounded-lg border border-border-default bg-bg-tertiary px-4 py-2',
                        'text-text-primary',
                        'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
                      )}
                    >
                      <option value="auto">Auto</option>
                      <option value="1080p">1080p</option>
                      <option value="720p">720p</option>
                      <option value="480p">480p</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'iptv' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">IPTV Settings</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-text-primary mb-2">M3U Playlists</h3>
                    <p className="text-sm text-text-muted mb-3">
                      Add M3U playlist URLs to stream live TV channels.
                    </p>
                    <button
                      className={cn(
                        'rounded-lg bg-accent-primary px-4 py-2',
                        'text-sm font-medium text-white',
                        'hover:bg-accent-primary/90 transition-colors'
                      )}
                    >
                      Add Playlist
                    </button>
                  </div>

                  <div className="border-t border-border-subtle pt-4">
                    <h3 className="text-sm font-medium text-text-primary mb-2">Xtream Codes</h3>
                    <p className="text-sm text-text-muted mb-3">
                      Connect to Xtream Codes providers for additional channels.
                    </p>
                    <button
                      className={cn(
                        'rounded-lg bg-accent-secondary px-4 py-2',
                        'text-sm font-medium text-white',
                        'hover:bg-accent-secondary/90 transition-colors'
                      )}
                    >
                      Add Provider
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
