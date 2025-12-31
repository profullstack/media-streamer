'use client';

import { useCallback, useMemo } from 'react';
import {
  trackEvent as baseTrackEvent,
  trackCheckout as baseTrackCheckout,
  trackSearch as baseTrackSearch,
  trackPlayback as baseTrackPlayback,
  trackDownload as baseTrackDownload,
  trackSignup as baseTrackSignup,
  trackLogin as baseTrackLogin,
  trackSubscription as baseTrackSubscription,
  trackWatchParty as baseTrackWatchParty,
  type AnalyticsEvent,
  type BaseEventData,
  type CheckoutEventData,
  type SearchEventData,
  type PlaybackEventData,
  type DownloadEventData,
  type SignupEventData,
  type LoginEventData,
  type SubscriptionEventData,
  type WatchPartyEventData,
} from '@/lib/analytics';

/**
 * Return type for the useAnalytics hook
 */
export interface UseAnalyticsResult {
  trackEvent: (eventName: AnalyticsEvent, eventData: BaseEventData) => void;
  trackCheckout: (data: CheckoutEventData) => void;
  trackSearch: (data: SearchEventData) => void;
  trackPlayback: (data: PlaybackEventData) => void;
  trackDownload: (data: DownloadEventData) => void;
  trackSignup: (data: SignupEventData) => void;
  trackLogin: (data: LoginEventData) => void;
  trackSubscription: (data: SubscriptionEventData) => void;
  trackWatchParty: (data: WatchPartyEventData) => void;
}

/**
 * React hook for tracking analytics events
 * Provides memoized tracking functions for all supported event types
 * 
 * @returns Object containing all tracking functions
 * 
 * @example
 * ```tsx
 * const { trackPlayback, trackSearch } = useAnalytics();
 * 
 * // Track a search
 * trackSearch({ query: 'movie title', results_count: 10 });
 * 
 * // Track playback start
 * trackPlayback({ action: 'start', media_type: 'video', title: 'Movie', infohash: 'abc123' });
 * ```
 */
export function useAnalytics(): UseAnalyticsResult {
  const trackEvent = useCallback(
    (eventName: AnalyticsEvent, eventData: BaseEventData): void => {
      baseTrackEvent(eventName, eventData);
    },
    []
  );

  const trackCheckout = useCallback((data: CheckoutEventData): void => {
    baseTrackCheckout(data);
  }, []);

  const trackSearch = useCallback((data: SearchEventData): void => {
    baseTrackSearch(data);
  }, []);

  const trackPlayback = useCallback((data: PlaybackEventData): void => {
    baseTrackPlayback(data);
  }, []);

  const trackDownload = useCallback((data: DownloadEventData): void => {
    baseTrackDownload(data);
  }, []);

  const trackSignup = useCallback((data: SignupEventData): void => {
    baseTrackSignup(data);
  }, []);

  const trackLogin = useCallback((data: LoginEventData): void => {
    baseTrackLogin(data);
  }, []);

  const trackSubscription = useCallback((data: SubscriptionEventData): void => {
    baseTrackSubscription(data);
  }, []);

  const trackWatchParty = useCallback((data: WatchPartyEventData): void => {
    baseTrackWatchParty(data);
  }, []);

  return useMemo(
    () => ({
      trackEvent,
      trackCheckout,
      trackSearch,
      trackPlayback,
      trackDownload,
      trackSignup,
      trackLogin,
      trackSubscription,
      trackWatchParty,
    }),
    [
      trackEvent,
      trackCheckout,
      trackSearch,
      trackPlayback,
      trackDownload,
      trackSignup,
      trackLogin,
      trackSubscription,
      trackWatchParty,
    ]
  );
}
