'use client';

/**
 * Settings Page
 *
 * User settings and preferences.
 * IPTV playlists are managed via the Live TV page.
 */

import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { SettingsIcon, UserIcon, TvIcon, VideoIcon, TrashIcon, ExternalLinkIcon, LoadingSpinner } from '@/components/ui/icons';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';

type SettingsTab = 'account' | 'playback' | 'iptv';

/**
 * IPTV Playlist data from API
 */
interface IPTVPlaylist {
  id: string;
  name: string;
  m3uUrl: string;
  epgUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * API response for playlists
 */
interface PlaylistsApiResponse {
  playlists: IPTVPlaylist[];
}

export default function SettingsPage(): React.ReactElement {
  const { isLoggedIn, isLoading: isAuthLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [transcodingEnabled, setTranscodingEnabled] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [quality, setQuality] = useState('auto');
  
  // IPTV playlists state
  const [playlists, setPlaylists] = useState<IPTVPlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: UserIcon },
    { id: 'playback' as const, label: 'Playback', icon: VideoIcon },
    { id: 'iptv' as const, label: 'IPTV', icon: TvIcon },
  ];

  // Load IPTV playlists when IPTV tab is active
  const loadPlaylists = useCallback(async (): Promise<void> => {
    if (!isLoggedIn) return;
    
    setIsLoadingPlaylists(true);
    setPlaylistsError(null);
    
    try {
      const response = await fetch('/api/iptv/playlists');
      
      if (!response.ok) {
        throw new Error('Failed to load playlists');
      }
      
      const data = await response.json() as PlaylistsApiResponse;
      setPlaylists(data.playlists);
    } catch (err) {
      console.error('[Settings] Error loading playlists:', err);
      setPlaylistsError(err instanceof Error ? err.message : 'Failed to load playlists');
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [isLoggedIn]);

  // Load playlists when IPTV tab becomes active
  useEffect(() => {
    if (activeTab === 'iptv' && isLoggedIn && !isAuthLoading) {
      void loadPlaylists();
    }
  }, [activeTab, isLoggedIn, isAuthLoading, loadPlaylists]);

  // Delete playlist handler
  const handleDeletePlaylist = async (playlistId: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    
    try {
      const response = await fetch(`/api/iptv/playlists/${playlistId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete playlist');
      }
      
      // Remove from local state
      setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    } catch (err) {
      console.error('[Settings] Error deleting playlist:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete playlist');
    }
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get subscription label
  const subscriptionLabel = user?.subscription_tier === 'premium'
    ? 'Premium'
    : user?.subscription_tier === 'family'
      ? 'Family'
      : user?.subscription_tier === 'trial'
        ? 'Trial'
        : 'Free Plan';

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
                        value={user?.email ?? 'Not logged in'}
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
                        <span className={cn(
                          'rounded-full px-3 py-1 text-sm font-medium',
                          user?.subscription_tier === 'premium' || user?.subscription_tier === 'family'
                            ? 'bg-accent-secondary/10 text-accent-secondary'
                            : 'bg-accent-primary/10 text-accent-primary'
                        )}>
                          {subscriptionLabel}
                        </span>
                        {(!user?.subscription_tier || user.subscription_tier === 'free' || user.subscription_tier === 'trial') && (
                          <Link href="/pricing" className="text-sm text-accent-primary hover:underline">
                            Upgrade
                          </Link>
                        )}
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-text-primary">IPTV Playlists</h2>
                  <Link
                    href="/live-tv"
                    className={cn(
                      'flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2',
                      'text-sm font-medium text-white',
                      'hover:bg-accent-primary/90 transition-colors'
                    )}
                  >
                    <ExternalLinkIcon size={16} />
                    <span>Manage in Live TV</span>
                  </Link>
                </div>

                <p className="text-sm text-text-muted">
                  Your IPTV playlists are managed from the Live TV page. You can add, edit, and delete playlists there.
                </p>

                {!isLoggedIn && !isAuthLoading && (
                  <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                    <p className="text-sm text-text-muted">
                      Sign in to save your IPTV playlists across devices. Guest playlists are stored locally in your browser.
                    </p>
                  </div>
                )}

                {isAuthLoading || isLoadingPlaylists ? (
                  <div className="flex items-center gap-2 py-4">
                    <LoadingSpinner size={20} className="text-accent-primary" />
                    <span className="text-sm text-text-muted">Loading playlists...</span>
                  </div>
                ) : playlistsError ? (
                  <div className="rounded-lg border border-status-error bg-status-error/10 p-4 text-sm text-status-error">
                    {playlistsError}
                  </div>
                ) : isLoggedIn && playlists.length === 0 ? (
                  <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                    <p className="text-sm text-text-muted">
                      No playlists configured. Go to the Live TV page to add your first playlist.
                    </p>
                  </div>
                ) : isLoggedIn && playlists.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-text-primary">
                      Your Playlists ({playlists.length})
                    </h3>
                    <div className="space-y-2">
                      {playlists.map((playlist) => (
                        <div
                          key={playlist.id}
                          className="flex items-center justify-between rounded-lg border border-border-default bg-bg-tertiary p-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {playlist.name}
                            </p>
                            <p className="text-xs text-text-muted truncate">
                              Added {formatDate(playlist.createdAt)}
                            </p>
                          </div>
                          <button
                            onClick={() => void handleDeletePlaylist(playlist.id)}
                            className={cn(
                              'p-2 rounded-lg transition-colors',
                              'text-text-muted hover:text-status-error hover:bg-status-error/10'
                            )}
                            title="Delete playlist"
                          >
                            <TrashIcon size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
