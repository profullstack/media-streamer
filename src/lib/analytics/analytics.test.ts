import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackEvent,
  trackCheckout,
  trackSearch,
  trackPlayback,
  trackDownload,
  trackSignup,
  trackLogin,
  trackSubscription,
  trackWatchParty,
  type AnalyticsEvent,
  type CheckoutEventData,
  type SearchEventData,
  type PlaybackEventData,
  type DownloadEventData,
  type SignupEventData,
  type LoginEventData,
  type SubscriptionEventData,
  type WatchPartyEventData,
} from './analytics';

describe('analytics', () => {
  let mockDatafast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDatafast = vi.fn();
    // @ts-expect-error - mocking window.datafast
    globalThis.window = { datafast: mockDatafast };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error - cleaning up mock
    delete globalThis.window;
  });

  describe('trackEvent', () => {
    it('should call window.datafast with event name and data', () => {
      const eventName: AnalyticsEvent = 'initiate_checkout';
      const eventData = { product_id: 'prod_123' };

      trackEvent(eventName, eventData);

      expect(mockDatafast).toHaveBeenCalledWith(eventName, eventData);
    });

    it('should not throw when window is undefined', () => {
      // @ts-expect-error - testing undefined window
      delete globalThis.window;

      expect(() => trackEvent('initiate_checkout', {})).not.toThrow();
    });

    it('should not throw when datafast is undefined', () => {
      // @ts-expect-error - testing undefined datafast
      globalThis.window = {};

      expect(() => trackEvent('initiate_checkout', {})).not.toThrow();
    });

    it('should handle empty event data', () => {
      trackEvent('page_view', {});

      expect(mockDatafast).toHaveBeenCalledWith('page_view', {});
    });
  });

  describe('trackCheckout', () => {
    it('should track checkout with user and product info', () => {
      const data: CheckoutEventData = {
        name: 'John Doe',
        email: 'john@example.com',
        product_id: 'prod_premium',
        plan: 'monthly',
        amount: 9.99,
      };

      trackCheckout(data);

      expect(mockDatafast).toHaveBeenCalledWith('initiate_checkout', data);
    });

    it('should track checkout with minimal required fields', () => {
      const data: CheckoutEventData = {
        email: 'user@example.com',
        product_id: 'prod_basic',
      };

      trackCheckout(data);

      expect(mockDatafast).toHaveBeenCalledWith('initiate_checkout', data);
    });
  });

  describe('trackSearch', () => {
    it('should track search with query and results count', () => {
      const data: SearchEventData = {
        query: 'test search',
        results_count: 42,
        category: 'music',
      };

      trackSearch(data);

      expect(mockDatafast).toHaveBeenCalledWith('search', data);
    });

    it('should track search with filters', () => {
      const data: SearchEventData = {
        query: 'movie title',
        results_count: 10,
        category: 'movies',
        filters: { year: '2024', quality: 'HD' },
      };

      trackSearch(data);

      expect(mockDatafast).toHaveBeenCalledWith('search', data);
    });
  });

  describe('trackPlayback', () => {
    it('should track playback start', () => {
      const data: PlaybackEventData = {
        action: 'start',
        media_type: 'video',
        title: 'Test Movie',
        infohash: 'abc123',
      };

      trackPlayback(data);

      expect(mockDatafast).toHaveBeenCalledWith('playback', data);
    });

    it('should track playback with duration and position', () => {
      const data: PlaybackEventData = {
        action: 'pause',
        media_type: 'audio',
        title: 'Test Song',
        infohash: 'def456',
        duration: 180,
        position: 90,
      };

      trackPlayback(data);

      expect(mockDatafast).toHaveBeenCalledWith('playback', data);
    });

    it('should track playback complete', () => {
      const data: PlaybackEventData = {
        action: 'complete',
        media_type: 'video',
        title: 'Test Episode',
        infohash: 'ghi789',
        duration: 2400,
      };

      trackPlayback(data);

      expect(mockDatafast).toHaveBeenCalledWith('playback', data);
    });
  });

  describe('trackDownload', () => {
    it('should track download initiation', () => {
      const data: DownloadEventData = {
        action: 'start',
        infohash: 'abc123',
        title: 'Test Torrent',
        size: 1024000,
      };

      trackDownload(data);

      expect(mockDatafast).toHaveBeenCalledWith('download', data);
    });

    it('should track download completion', () => {
      const data: DownloadEventData = {
        action: 'complete',
        infohash: 'abc123',
        title: 'Test Torrent',
        size: 1024000,
        duration: 300,
      };

      trackDownload(data);

      expect(mockDatafast).toHaveBeenCalledWith('download', data);
    });
  });

  describe('trackSignup', () => {
    it('should track signup event', () => {
      const data: SignupEventData = {
        method: 'email',
        email: 'newuser@example.com',
      };

      trackSignup(data);

      expect(mockDatafast).toHaveBeenCalledWith('signup', data);
    });

    it('should track signup with referral', () => {
      const data: SignupEventData = {
        method: 'email',
        email: 'referred@example.com',
        referral_code: 'FRIEND123',
      };

      trackSignup(data);

      expect(mockDatafast).toHaveBeenCalledWith('signup', data);
    });
  });

  describe('trackLogin', () => {
    it('should track login event', () => {
      const data: LoginEventData = {
        method: 'email',
        email: 'user@example.com',
      };

      trackLogin(data);

      expect(mockDatafast).toHaveBeenCalledWith('login', data);
    });

    it('should track login with success status', () => {
      const data: LoginEventData = {
        method: 'magic_link',
        email: 'user@example.com',
        success: true,
      };

      trackLogin(data);

      expect(mockDatafast).toHaveBeenCalledWith('login', data);
    });
  });

  describe('trackSubscription', () => {
    it('should track subscription creation', () => {
      const data: SubscriptionEventData = {
        action: 'create',
        plan: 'premium',
        amount: 9.99,
        currency: 'USD',
      };

      trackSubscription(data);

      expect(mockDatafast).toHaveBeenCalledWith('subscription', data);
    });

    it('should track subscription cancellation', () => {
      const data: SubscriptionEventData = {
        action: 'cancel',
        plan: 'premium',
        reason: 'too_expensive',
      };

      trackSubscription(data);

      expect(mockDatafast).toHaveBeenCalledWith('subscription', data);
    });

    it('should track subscription renewal', () => {
      const data: SubscriptionEventData = {
        action: 'renew',
        plan: 'family',
        amount: 14.99,
        currency: 'USD',
      };

      trackSubscription(data);

      expect(mockDatafast).toHaveBeenCalledWith('subscription', data);
    });
  });

  describe('trackWatchParty', () => {
    it('should track watch party creation', () => {
      const data: WatchPartyEventData = {
        action: 'create',
        party_id: 'party_123',
        media_title: 'Test Movie',
      };

      trackWatchParty(data);

      expect(mockDatafast).toHaveBeenCalledWith('watch_party', data);
    });

    it('should track watch party join', () => {
      const data: WatchPartyEventData = {
        action: 'join',
        party_id: 'party_123',
        participant_count: 5,
      };

      trackWatchParty(data);

      expect(mockDatafast).toHaveBeenCalledWith('watch_party', data);
    });

    it('should track watch party leave', () => {
      const data: WatchPartyEventData = {
        action: 'leave',
        party_id: 'party_123',
        duration: 3600,
      };

      trackWatchParty(data);

      expect(mockDatafast).toHaveBeenCalledWith('watch_party', data);
    });
  });
});
