'use client';

/**
 * Podcasts Page
 *
 * Podcast discovery and subscription management.
 * Features:
 * - Search podcasts via Castos API
 * - Subscribe to podcasts (saved in Supabase)
 * - View subscribed podcasts and episodes
 * - Audio player for podcast episodes (global, persists across routes)
 * - Push notification subscription for new episodes
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  PodcastIcon,
  SearchIcon,
  PlayIcon,
  PauseIcon,
  LoadingSpinner,
  BellIcon,
  BellRingIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
  CheckIcon,
} from '@/components/ui/icons';
import { useAuth } from '@/hooks/use-auth';
import { usePodcastPlayer } from '@/contexts/podcast-player';

/**
 * Sanitize HTML content from RSS feeds for safe rendering
 * Allows basic formatting tags but strips potentially dangerous content
 */
function sanitizeHtml(html: string): string {
  // Strip CDATA wrappers first if present
  let cleaned = html;
  cleaned = cleaned.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  cleaned = cleaned.replace(/&lt;!\[CDATA\[([\s\S]*?)\]\]&gt;/gi, '$1');

  return DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  });
}

/**
 * Decode HTML entities in text (for titles that may contain &amp; &#39; etc.)
 * Strips all HTML tags and only decodes entities
 */
function decodeHtmlEntities(text: string): string {
  // First sanitize to strip any HTML tags, then decode entities
  const stripped = DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  // Create a textarea to decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = stripped;
  return textarea.value;
}

/**
 * Convert base64 VAPID key to Uint8Array for push subscription
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Podcast search result from API
 */
interface PodcastSearchResult {
  title: string;
  author: string;
  description: string;
  imageUrl: string | null;
  feedUrl: string;
  website: string | null;
}

/**
 * Subscribed podcast from API
 */
interface SubscribedPodcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  website: string | null;
  subscribedAt: string;
  notificationsEnabled: boolean;
}

/**
 * Podcast episode from API
 */
interface PodcastEpisode {
  id: string;
  guid: string;
  title: string;
  description: string | null;
  audioUrl: string;
  duration: number | null;
  publishedAt: string;
  imageUrl: string | null;
}

/**
 * Episode listen progress from API
 */
interface EpisodeProgress {
  episodeId: string;
  currentTimeSeconds: number;
  durationSeconds: number | null;
  percentage: number;
  completed: boolean;
  lastListenedAt: string;
}

/**
 * API response types
 */
interface SearchResponse {
  results: PodcastSearchResult[];
}

interface SubscriptionsResponse {
  subscriptions: SubscribedPodcast[];
}

interface EpisodesResponse {
  episodes: PodcastEpisode[];
  podcast: {
    id: string;
    title: string;
  };
}

interface SubscribeResponse {
  subscription: SubscribedPodcast;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date to relative time or date string
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function PodcastsPage(): React.ReactElement {
  const router = useRouter();
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      router.push('/login?redirect=/podcasts');
    }
  }, [isAuthLoading, isLoggedIn, router]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PodcastSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<SubscribedPodcast[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);
  
  // Selected podcast state
  const [selectedPodcast, setSelectedPodcast] = useState<SubscribedPodcast | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);

  // Episode progress state
  const [episodeProgress, setEpisodeProgress] = useState<Map<string, EpisodeProgress>>(new Map());
  
  // Global podcast player context
  const {
    currentEpisode,
    isPlaying,
    playEpisode,
    lastCompletedEpisodeId,
  } = usePodcastPlayer();
  
  // Subscribe action state
  const [subscribingFeedUrl, setSubscribingFeedUrl] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  
  // Unsubscribe action state
  const [unsubscribingPodcastId, setUnsubscribingPodcastId] = useState<string | null>(null);
  const [unsubscribeError, setUnsubscribeError] = useState<string | null>(null);
  const [confirmUnsubscribeId, setConfirmUnsubscribeId] = useState<string | null>(null);
  
  // Push notification state
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'search'>('subscriptions');
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(null);
  
  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check push notification support
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsPushSupported(true);
    }
  }, []);

  // Load subscriptions when logged in
  useEffect(() => {
    if (isAuthLoading || !isLoggedIn) return;
    
    const loadSubscriptions = async (): Promise<void> => {
      setIsLoadingSubscriptions(true);
      setSubscriptionsError(null);
      
      try {
        const response = await fetch('/api/podcasts');
        
        if (!response.ok) {
          const data = await response.json() as { error?: string };
          throw new Error(data.error ?? 'Failed to load subscriptions');
        }
        
        const data = await response.json() as SubscriptionsResponse;
        setSubscriptions(data.subscriptions);
        
        // Auto-select first subscription if any
        if (data.subscriptions.length > 0 && !selectedPodcast) {
          setSelectedPodcast(data.subscriptions[0]);
        }
      } catch (err) {
        console.error('[Podcasts] Error loading subscriptions:', err);
        setSubscriptionsError(err instanceof Error ? err.message : 'Failed to load subscriptions');
      } finally {
        setIsLoadingSubscriptions(false);
      }
    };
    
    void loadSubscriptions();
  }, [isLoggedIn, isAuthLoading, selectedPodcast]);

  // Load episodes and progress when podcast is selected
  useEffect(() => {
    if (!selectedPodcast) {
      setEpisodes([]);
      setEpisodeProgress(new Map());
      return;
    }

    const loadEpisodesAndProgress = async (): Promise<void> => {
      setIsLoadingEpisodes(true);
      setEpisodesError(null);

      try {
        // Fetch episodes and progress in parallel
        const [episodesResponse, progressResponse] = await Promise.all([
          fetch(`/api/podcasts/${selectedPodcast.id}/episodes`),
          fetch(`/api/podcasts/progress?podcastId=${selectedPodcast.id}`),
        ]);

        if (!episodesResponse.ok) {
          const data = await episodesResponse.json() as { error?: string };
          throw new Error(data.error ?? 'Failed to load episodes');
        }

        const episodesData = await episodesResponse.json() as EpisodesResponse;
        setEpisodes(episodesData.episodes);

        // Load progress if authenticated (might return 401 if not logged in)
        if (progressResponse.ok) {
          const progressData = await progressResponse.json() as { progress: EpisodeProgress[] };
          const progressMap = new Map<string, EpisodeProgress>();
          for (const p of progressData.progress) {
            progressMap.set(p.episodeId, p);
          }
          setEpisodeProgress(progressMap);
        }
      } catch (err) {
        console.error('[Podcasts] Error loading episodes:', err);
        setEpisodesError(err instanceof Error ? err.message : 'Failed to load episodes');
      } finally {
        setIsLoadingEpisodes(false);
      }
    };

    void loadEpisodesAndProgress();
  }, [selectedPodcast]);

  // Refresh progress when an episode is completed
  useEffect(() => {
    if (!lastCompletedEpisodeId || !selectedPodcast) return;

    const refreshProgress = async (): Promise<void> => {
      try {
        const progressResponse = await fetch(`/api/podcasts/progress?podcastId=${selectedPodcast.id}`);
        if (progressResponse.ok) {
          const progressData = await progressResponse.json() as { progress: EpisodeProgress[] };
          const progressMap = new Map<string, EpisodeProgress>();
          for (const p of progressData.progress) {
            progressMap.set(p.episodeId, p);
          }
          setEpisodeProgress(progressMap);
        }
      } catch (err) {
        console.error('[Podcasts] Error refreshing progress:', err);
      }
    };

    void refreshProgress();
  }, [lastCompletedEpisodeId, selectedPodcast]);

  // Search podcasts with debounce
  const handleSearch = useCallback((query: string): void => {
    setSearchQuery(query);
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    
    debounceTimerRef.current = setTimeout(() => {
      const performSearch = async (): Promise<void> => {
        setIsSearching(true);
        setSearchError(null);
        
        try {
          const response = await fetch(`/api/podcasts?q=${encodeURIComponent(query)}`);
          
          if (!response.ok) {
            const data = await response.json() as { error?: string };
            throw new Error(data.error ?? 'Search failed');
          }
          
          const data = await response.json() as SearchResponse;
          setSearchResults(data.results);
        } catch (err) {
          console.error('[Podcasts] Search error:', err);
          setSearchError(err instanceof Error ? err.message : 'Search failed');
        } finally {
          setIsSearching(false);
        }
      };
      
      void performSearch();
    }, 300);
  }, []);

  // Subscribe to podcast
  const handleSubscribe = useCallback(async (podcast: PodcastSearchResult): Promise<void> => {
    if (!isLoggedIn) {
      setSubscribeError('Please sign in to subscribe to podcasts');
      return;
    }
    
    setSubscribingFeedUrl(podcast.feedUrl);
    setSubscribeError(null);
    
    try {
      const response = await fetch('/api/podcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: podcast.feedUrl }),
      });
      
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to subscribe');
      }
      
      const data = await response.json() as SubscribeResponse;
      setSubscriptions(prev => [data.subscription, ...prev]);
      setSelectedPodcast(data.subscription);
      setActiveTab('subscriptions');
      setSearchQuery('');
      setSearchResults([]);
      setSubscribeError(null);
    } catch (err) {
      console.error('[Podcasts] Subscribe error:', err);
      setSubscribeError(err instanceof Error ? err.message : 'Failed to subscribe to podcast');
    } finally {
      setSubscribingFeedUrl(null);
    }
  }, [isLoggedIn]);

  // Unsubscribe from podcast
  const handleUnsubscribe = useCallback(async (podcastId: string): Promise<void> => {
    setUnsubscribingPodcastId(podcastId);
    setUnsubscribeError(null);
    
    try {
      const response = await fetch(`/api/podcasts?podcastId=${podcastId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to unsubscribe');
      }
      
      setSubscriptions(prev => prev.filter(s => s.id !== podcastId));
      setConfirmUnsubscribeId(null);
      
      if (selectedPodcast?.id === podcastId) {
        setSelectedPodcast(null);
        setEpisodes([]);
      }
    } catch (err) {
      console.error('[Podcasts] Unsubscribe error:', err);
      setUnsubscribeError(err instanceof Error ? err.message : 'Failed to unsubscribe');
    } finally {
      setUnsubscribingPodcastId(null);
    }
  }, [selectedPodcast]);

  // Cancel unsubscribe confirmation
  const cancelUnsubscribe = useCallback((): void => {
    setConfirmUnsubscribeId(null);
    setUnsubscribeError(null);
  }, []);

  // Play episode using global context
  const handlePlayEpisode = useCallback((episode: PodcastEpisode): void => {
    if (!selectedPodcast) return;

    // Get saved progress for this episode (to resume from last position)
    const progress = episodeProgress.get(episode.id);
    // Only resume if not completed and has some progress
    const startTime = progress && !progress.completed && progress.currentTimeSeconds > 10
      ? progress.currentTimeSeconds
      : undefined;

    // Convert to the format expected by the global player
    playEpisode(
      {
        id: episode.id,
        guid: episode.guid,
        title: episode.title,
        description: episode.description,
        audioUrl: episode.audioUrl,
        duration: episode.duration,
        publishedAt: episode.publishedAt,
        imageUrl: episode.imageUrl,
      },
      {
        id: selectedPodcast.id,
        title: selectedPodcast.title,
        author: selectedPodcast.author,
        description: selectedPodcast.description,
        imageUrl: selectedPodcast.imageUrl,
        feedUrl: selectedPodcast.feedUrl,
        website: selectedPodcast.website,
        subscribedAt: selectedPodcast.subscribedAt,
        notificationsEnabled: selectedPodcast.notificationsEnabled,
      },
      startTime
    );
  }, [selectedPodcast, playEpisode, episodeProgress]);

  // Check if push notifications are already enabled
  useEffect(() => {
    if (!isPushSupported || !isLoggedIn) return;

    const checkPushStatus = async (): Promise<void> => {
      try {
        // Use root scope '/' since that's the default scope when registering /sw.js
        const registration = await navigator.serviceWorker.getRegistration('/');
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          setIsPushEnabled(subscription !== null);
        }
      } catch (err) {
        console.error('[Podcasts] Error checking push status:', err);
      }
    };

    void checkPushStatus();
  }, [isPushSupported, isLoggedIn]);

  // Enable push notifications
  const handleEnablePush = useCallback(async (): Promise<void> => {
    if (!isPushSupported || !isLoggedIn) return;

    setIsEnablingPush(true);
    setPushError(null);

    try {
      const keyResponse = await fetch('/api/push/subscribe');
      if (!keyResponse.ok) throw new Error('Failed to get push key');
      const { vapidPublicKey } = await keyResponse.json() as { vapidPublicKey: string };

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission denied. Please allow notifications in your browser settings.');

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!response.ok) throw new Error('Failed to register push subscription');

      setIsPushEnabled(true);
      setPushError(null);
    } catch (err) {
      console.error('[Podcasts] Push enable error:', err);
      setPushError(err instanceof Error ? err.message : 'Failed to enable notifications');
    } finally {
      setIsEnablingPush(false);
    }
  }, [isPushSupported, isLoggedIn]);

  // Disable push notifications
  const handleDisablePush = useCallback(async (): Promise<void> => {
    if (!isPushSupported || !isLoggedIn) return;

    setIsEnablingPush(true);
    setPushError(null);

    try {
      // Use root scope '/' since that's the default scope when registering /sw.js
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) throw new Error('Service worker not found');

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsPushEnabled(false);
        return;
      }

      // Unsubscribe from push manager
      await subscription.unsubscribe();

      // Remove subscription from server
      const response = await fetch(
        `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to unregister push subscription');

      setIsPushEnabled(false);
      setPushError(null);
    } catch (err) {
      console.error('[Podcasts] Push disable error:', err);
      setPushError(err instanceof Error ? err.message : 'Failed to disable notifications');
    } finally {
      setIsEnablingPush(false);
    }
  }, [isPushSupported, isLoggedIn]);

  // Toggle push notifications
  const handleTogglePush = useCallback((): void => {
    if (isPushEnabled) {
      void handleDisablePush();
    } else {
      void handleEnablePush();
    }
  }, [isPushEnabled, handleEnablePush, handleDisablePush]);

  // Check if already subscribed to a podcast
  const isSubscribed = useCallback((feedUrl: string): boolean => {
    return subscriptions.some(s => s.feedUrl === feedUrl);
  }, [subscriptions]);

  // Toggle episode description
  const toggleEpisodeExpand = useCallback((episodeId: string): void => {
    setExpandedEpisodeId(prev => prev === episodeId ? null : episodeId);
  }, []);

  return (
    <MainLayout>
      <div className="space-y-6 pb-24">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Podcasts</h1>
            <p className="text-sm text-text-secondary">
              Discover and subscribe to your favorite podcasts
            </p>
          </div>
          
          {isLoggedIn && isPushSupported ? <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleTogglePush}
                disabled={isEnablingPush}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 transition-all',
                  isPushEnabled
                    ? 'bg-accent-primary text-white hover:bg-accent-primary/90 shadow-lg shadow-accent-primary/25 ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-primary'
                    : 'bg-bg-secondary text-text-primary hover:bg-bg-hover'
                )}
              >
                {isEnablingPush ? (
                  <LoadingSpinner size={20} />
                ) : isPushEnabled ? (
                  <BellRingIcon size={20} className="animate-pulse" />
                ) : (
                  <BellIcon size={20} />
                )}
                <span>{isPushEnabled ? 'Notifications On' : 'Enable Notifications'}</span>
              </button>
              {pushError ? <p className="text-xs text-red-400 max-w-xs text-right">{pushError}</p> : null}
            </div> : null}
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-border-default">
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'subscriptions'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            My Podcasts
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'search'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            Discover
          </button>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search for podcasts..."
                className={cn(
                  'w-full rounded-xl border border-border-default bg-bg-secondary py-4 pl-12 pr-12',
                  'text-base text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50'
                )}
              />
              {isSearching ? <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <LoadingSpinner size={20} className="text-accent-primary" />
                </div> : null}
            </div>

            {searchError ? <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
                {searchError}
              </div> : null}

            {subscribeError ? <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
                {subscribeError}
              </div> : null}

            {searchResults.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((podcast) => (
                  <div
                    key={podcast.feedUrl}
                    className={cn(
                      'rounded-lg border border-border-subtle bg-bg-secondary p-4',
                      'hover:border-accent-primary/50 transition-colors'
                    )}
                  >
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        {podcast.imageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element -- External podcast images from search API */
                          <img
                            src={podcast.imageUrl}
                            alt={decodeHtmlEntities(podcast.title)}
                            className="h-20 w-20 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-bg-tertiary">
                            <PodcastIcon size={32} className="text-text-muted" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-text-primary truncate">{decodeHtmlEntities(podcast.title)}</h3>
                        <p className="text-sm text-text-muted truncate">{podcast.author}</p>
                        {podcast.description ? <div
                          className="text-xs text-text-muted mt-1 line-clamp-2 prose prose-xs prose-invert max-w-none [&_*]:text-text-muted [&_p]:my-0 [&_div]:my-0 [&_br]:hidden"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(podcast.description) }}
                        /> : null}
                      </div>
                    </div>
                    <div className="mt-4">
                      {isSubscribed(podcast.feedUrl) ? (
                        <span className="text-sm text-green-400">Subscribed</span>
                      ) : (
                        <button
                          onClick={() => void handleSubscribe(podcast)}
                          disabled={subscribingFeedUrl === podcast.feedUrl || !isLoggedIn}
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-4 py-2 w-full justify-center',
                            'bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors',
                            'disabled:opacity-50'
                          )}
                        >
                          {subscribingFeedUrl === podcast.feedUrl ? (
                            <LoadingSpinner size={16} />
                          ) : (
                            <PlusIcon size={16} />
                          )}
                          <span>{isLoggedIn ? 'Subscribe' : 'Sign in to Subscribe'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isSearching && searchQuery && searchResults.length === 0 && !searchError ? <div className="flex flex-col items-center justify-center py-16 text-center">
                <SearchIcon size={48} className="text-text-muted mb-4" />
                <h3 className="text-lg font-medium text-text-primary mb-2">No podcasts found</h3>
                <p className="text-sm text-text-secondary">Try a different search term</p>
              </div> : null}

            {!searchQuery && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <PodcastIcon size={48} className="text-text-muted mb-4" />
                <h3 className="text-lg font-medium text-text-primary mb-2">Discover Podcasts</h3>
                <p className="text-sm text-text-secondary max-w-md">
                  Search for podcasts by name, topic, or host
                </p>
              </div>
            )}
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Subscriptions List */}
            <div className="lg:w-80 flex-shrink-0 space-y-2">
              {isLoadingSubscriptions ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner size={32} className="text-accent-primary" />
                </div>
              ) : subscriptionsError ? (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400 text-sm">
                  {subscriptionsError}
                </div>
              ) : !isLoggedIn ? (
                <div className="text-center py-8">
                  <PodcastIcon size={32} className="text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">Sign in to see your subscriptions</p>
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="text-center py-8">
                  <PodcastIcon size={32} className="text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No subscriptions yet</p>
                  <button
                    onClick={() => setActiveTab('search')}
                    className="mt-2 text-sm text-accent-primary hover:underline"
                  >
                    Discover podcasts
                  </button>
                </div>
              ) : (
                subscriptions.map((podcast) => (
                  <button
                    key={podcast.id}
                    onClick={() => setSelectedPodcast(podcast)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors',
                      selectedPodcast?.id === podcast.id
                        ? 'bg-accent-primary/10 border border-accent-primary/50'
                        : 'bg-bg-secondary hover:bg-bg-hover border border-transparent'
                    )}
                  >
                    {podcast.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- External podcast images from subscriptions */
                      <img
                        src={podcast.imageUrl}
                        alt={decodeHtmlEntities(podcast.title)}
                        className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg-tertiary flex-shrink-0">
                        <PodcastIcon size={20} className="text-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-text-primary truncate text-sm">{decodeHtmlEntities(podcast.title)}</h3>
                      <p className="text-xs text-text-muted truncate">{podcast.author}</p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Episodes List */}
            <div className="flex-1 min-w-0">
              {selectedPodcast ? (
                <div className="space-y-4">
                  {/* Podcast Header */}
                  <div className="flex items-start gap-4 p-4 rounded-lg bg-bg-secondary">
                    {selectedPodcast.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- External podcast images from subscriptions */
                      <img
                        src={selectedPodcast.imageUrl}
                        alt={decodeHtmlEntities(selectedPodcast.title)}
                        className="h-24 w-24 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-bg-tertiary flex-shrink-0">
                        <PodcastIcon size={40} className="text-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold text-text-primary">{decodeHtmlEntities(selectedPodcast.title)}</h2>
                      <p className="text-sm text-text-muted">{selectedPodcast.author}</p>
                      {selectedPodcast.description ? <div
                          className="text-sm text-text-secondary mt-2 line-clamp-2 prose prose-sm prose-invert max-w-none [&_a]:text-accent-primary [&_a]:hover:underline [&_p]:my-0 [&_div]:my-0 [&_br]:hidden"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedPodcast.description) }}
                        /> : null}
                      {/* Unsubscribe button with confirmation */}
                      {confirmUnsubscribeId === selectedPodcast.id ? (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-sm text-text-secondary">Unsubscribe?</span>
                          <button
                            onClick={() => void handleUnsubscribe(selectedPodcast.id)}
                            disabled={unsubscribingPodcastId === selectedPodcast.id}
                            className={cn(
                              'flex items-center gap-1 rounded px-3 py-1 text-sm',
                              'bg-red-500 text-white hover:bg-red-600 transition-colors',
                              'disabled:opacity-50'
                            )}
                          >
                            {unsubscribingPodcastId === selectedPodcast.id ? (
                              <LoadingSpinner size={14} />
                            ) : (
                              <TrashIcon size={14} />
                            )}
                            <span>Yes</span>
                          </button>
                          <button
                            onClick={cancelUnsubscribe}
                            className="rounded px-3 py-1 text-sm bg-bg-tertiary text-text-secondary hover:bg-bg-hover transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmUnsubscribeId(selectedPodcast.id)}
                          className="mt-3 flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
                        >
                          <TrashIcon size={14} />
                          <span>Unsubscribe</span>
                        </button>
                      )}
                      {unsubscribeError && confirmUnsubscribeId === selectedPodcast.id ? <p className="mt-2 text-sm text-red-400">{unsubscribeError}</p> : null}
                    </div>
                  </div>

                  {/* Episodes */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-text-primary">Episodes</h3>
                    
                    {isLoadingEpisodes ? (
                      <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size={32} className="text-accent-primary" />
                      </div>
                    ) : episodesError ? (
                      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400 text-sm">
                        {episodesError}
                      </div>
                    ) : episodes.length === 0 ? (
                      <p className="text-sm text-text-secondary py-4">No episodes found</p>
                    ) : (
                      <div className="space-y-2">
                        {episodes.map((episode) => {
                          const progress = episodeProgress.get(episode.id);
                          const isCompleted = progress?.completed ?? false;
                          const progressPercent = progress?.percentage ?? 0;
                          const hasProgress = progressPercent > 0 && !isCompleted;

                          return (
                            <div
                              key={episode.id}
                              className={cn(
                                'rounded-lg border bg-bg-secondary p-4 transition-colors',
                                currentEpisode?.id === episode.id
                                  ? 'border-accent-primary/50'
                                  : isCompleted
                                    ? 'border-green-500/30'
                                    : 'border-border-subtle hover:border-border-default'
                              )}
                            >
                              <div className="flex items-start gap-4">
                                <button
                                  onClick={() => handlePlayEpisode(episode)}
                                  className={cn(
                                    'flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 transition-colors',
                                    isCompleted
                                      ? 'bg-green-500 text-white hover:bg-green-600'
                                      : 'bg-accent-primary text-white hover:bg-accent-primary/90'
                                  )}
                                >
                                  {isCompleted ? (
                                    <CheckIcon size={20} />
                                  ) : currentEpisode?.id === episode.id && isPlaying ? (
                                    <PauseIcon size={20} />
                                  ) : (
                                    <PlayIcon size={20} />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className={cn(
                                      'font-medium',
                                      isCompleted ? 'text-text-muted' : 'text-text-primary'
                                    )}>
                                      {decodeHtmlEntities(episode.title)}
                                    </h4>
                                    {isCompleted && (
                                      <span className="text-xs text-green-500 font-medium">Played</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                                    <span>{formatDate(episode.publishedAt)}</span>
                                    <span>•</span>
                                    <span>{formatDuration(episode.duration)}</span>
                                    {hasProgress && (
                                      <>
                                        <span>•</span>
                                        <span className="text-accent-primary">{Math.round(progressPercent)}% played</span>
                                      </>
                                    )}
                                  </div>

                                  {/* Progress bar */}
                                  {(hasProgress || isCompleted) && (
                                    <div className="mt-2 h-1 w-full rounded-full bg-bg-tertiary overflow-hidden">
                                      <div
                                        className={cn(
                                          'h-full rounded-full transition-all',
                                          isCompleted ? 'bg-green-500' : 'bg-accent-primary'
                                        )}
                                        style={{ width: `${isCompleted ? 100 : progressPercent}%` }}
                                      />
                                    </div>
                                  )}

                                  {episode.description ? <div className="mt-2">
                                      <div
                                        className={cn(
                                          'text-sm text-text-secondary prose prose-sm prose-invert max-w-none',
                                          '[&_a]:text-accent-primary [&_a]:hover:underline',
                                          '[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1',
                                          expandedEpisodeId !== episode.id && 'line-clamp-2'
                                        )}
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(episode.description) }}
                                      />
                                      <button
                                        onClick={() => toggleEpisodeExpand(episode.id)}
                                        className="text-xs text-accent-primary hover:underline mt-1 flex items-center gap-1"
                                      >
                                        {expandedEpisodeId === episode.id ? (
                                          <>
                                            <ChevronUpIcon size={12} />
                                            <span>Show less</span>
                                          </>
                                        ) : (
                                          <>
                                            <ChevronDownIcon size={12} />
                                            <span>Show more</span>
                                          </>
                                        )}
                                      </button>
                                    </div> : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <PodcastIcon size={48} className="text-text-muted mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">Select a podcast</h3>
                  <p className="text-sm text-text-secondary">
                    Choose a podcast from the list to see episodes
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}