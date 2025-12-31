/**
 * Analytics module for tracking UX interactions using Datafast
 * @module analytics
 */

// Extend Window interface to include datafast
declare global {
  interface Window {
    datafast?: (event: string, data: Record<string, unknown>) => void;
  }
}

/**
 * Supported analytics event types
 */
export type AnalyticsEvent =
  | 'initiate_checkout'
  | 'search'
  | 'playback'
  | 'download'
  | 'signup'
  | 'login'
  | 'subscription'
  | 'watch_party'
  | 'page_view'
  | 'click'
  | 'error';

/**
 * Base event data interface
 */
export interface BaseEventData {
  [key: string]: unknown;
}

/**
 * Checkout event data
 */
export interface CheckoutEventData extends BaseEventData {
  name?: string;
  email: string;
  product_id: string;
  plan?: string;
  amount?: number;
  currency?: string;
}

/**
 * Search event data
 */
export interface SearchEventData extends BaseEventData {
  query: string;
  results_count: number;
  category?: string;
  filters?: Record<string, string>;
}

/**
 * Playback event data
 */
export interface PlaybackEventData extends BaseEventData {
  action: 'start' | 'pause' | 'resume' | 'seek' | 'complete' | 'error';
  media_type: 'video' | 'audio' | 'ebook';
  title: string;
  infohash: string;
  duration?: number;
  position?: number;
  quality?: string;
}

/**
 * Download event data
 */
export interface DownloadEventData extends BaseEventData {
  action: 'start' | 'progress' | 'complete' | 'error';
  infohash: string;
  title: string;
  size?: number;
  duration?: number;
  progress?: number;
}

/**
 * Signup event data
 */
export interface SignupEventData extends BaseEventData {
  method: 'email' | 'magic_link' | 'oauth';
  email: string;
  referral_code?: string;
}

/**
 * Login event data
 */
export interface LoginEventData extends BaseEventData {
  method: 'email' | 'magic_link' | 'oauth';
  email: string;
  success?: boolean;
}

/**
 * Subscription event data
 */
export interface SubscriptionEventData extends BaseEventData {
  action: 'create' | 'cancel' | 'renew' | 'upgrade' | 'downgrade';
  plan: string;
  amount?: number;
  currency?: string;
  reason?: string;
}

/**
 * Watch party event data
 */
export interface WatchPartyEventData extends BaseEventData {
  action: 'create' | 'join' | 'leave' | 'sync' | 'chat';
  party_id: string;
  media_title?: string;
  participant_count?: number;
  duration?: number;
}

/**
 * Track a generic analytics event
 * @param eventName - The name of the event to track
 * @param eventData - The data associated with the event
 */
export function trackEvent(eventName: AnalyticsEvent, eventData: BaseEventData): void {
  if (typeof window === 'undefined' || typeof window.datafast !== 'function') {
    return;
  }
  window.datafast(eventName, eventData);
}

/**
 * Track checkout initiation
 * @param data - Checkout event data
 */
export function trackCheckout(data: CheckoutEventData): void {
  trackEvent('initiate_checkout', data);
}

/**
 * Track search events
 * @param data - Search event data
 */
export function trackSearch(data: SearchEventData): void {
  trackEvent('search', data);
}

/**
 * Track media playback events
 * @param data - Playback event data
 */
export function trackPlayback(data: PlaybackEventData): void {
  trackEvent('playback', data);
}

/**
 * Track download events
 * @param data - Download event data
 */
export function trackDownload(data: DownloadEventData): void {
  trackEvent('download', data);
}

/**
 * Track signup events
 * @param data - Signup event data
 */
export function trackSignup(data: SignupEventData): void {
  trackEvent('signup', data);
}

/**
 * Track login events
 * @param data - Login event data
 */
export function trackLogin(data: LoginEventData): void {
  trackEvent('login', data);
}

/**
 * Track subscription events
 * @param data - Subscription event data
 */
export function trackSubscription(data: SubscriptionEventData): void {
  trackEvent('subscription', data);
}

/**
 * Track watch party events
 * @param data - Watch party event data
 */
export function trackWatchParty(data: WatchPartyEventData): void {
  trackEvent('watch_party', data);
}
