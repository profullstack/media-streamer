/**
 * Push Notifications Service Tests
 * 
 * Tests for the web push notification service.
 * Following TDD - tests written first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPushNotificationService,
  type PushNotificationService,
  type PushSubscriptionData,
  type NotificationPayload,
} from './push-notifications';
import { sendPush, type PushResult } from '@profullstack/notifications/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

// Mock the push sender; everything else in the package stays real
vi.mock('@profullstack/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@profullstack/notifications/server')>()),
  sendPush: vi.fn(),
}));

/** What sendPush resolves to for an HTTP status */
function pushResult(status: number, error: string | null = null): PushResult {
  return {
    endpoint: 'https://push.example.com/send/abc123',
    status,
    sent: status >= 200 && status < 300,
    gone: status === 404 || status === 410,
    error,
  };
}

// Mock Supabase client
function createMockClient() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockUpsert = vi.fn();

  const chainMock = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    single: mockSingle,
    upsert: mockUpsert,
  };

  mockSelect.mockReturnValue(chainMock);
  mockInsert.mockReturnValue(chainMock);
  mockUpdate.mockReturnValue(chainMock);
  mockDelete.mockReturnValue(chainMock);
  mockEq.mockReturnValue(chainMock);
  mockUpsert.mockReturnValue(chainMock);

  const mockFrom = vi.fn().mockReturnValue(chainMock);

  return {
    from: mockFrom,
    _mocks: {
      from: mockFrom,
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      eq: mockEq,
      single: mockSingle,
      upsert: mockUpsert,
    },
  } as unknown as SupabaseClient<Database> & {
    _mocks: {
      from: ReturnType<typeof vi.fn>;
      select: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      single: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
}

describe('PushNotificationService', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let service: PushNotificationService;

  const mockConfig = {
    vapidPublicKey: 'test-public-key',
    vapidPrivateKey: 'test-private-key',
    vapidSubject: 'mailto:test@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    service = createPushNotificationService(mockClient, mockConfig);
  });

  describe('registerSubscription', () => {
    it('should register a new push subscription', async () => {
      const userId = 'user-123';
      const subscriptionData: PushSubscriptionData = {
        endpoint: 'https://push.example.com/send/abc123',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      };

      const mockSubscription = {
        id: 'sub-456',
        user_id: userId,
        endpoint: subscriptionData.endpoint,
        p256dh_key: subscriptionData.keys.p256dh,
        auth_key: subscriptionData.keys.auth,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockSubscription, error: null });

      const result = await service.registerSubscription(userId, subscriptionData);

      expect(result).toEqual(mockSubscription);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockClient._mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          endpoint: subscriptionData.endpoint,
          p256dh_key: subscriptionData.keys.p256dh,
          auth_key: subscriptionData.keys.auth,
        }),
        { onConflict: 'endpoint' }
      );
    });

    it('should include user agent when provided', async () => {
      const userId = 'user-123';
      const subscriptionData: PushSubscriptionData = {
        endpoint: 'https://push.example.com/send/abc123',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      };
      const userAgent = 'Mozilla/5.0 Test Browser';

      mockClient._mocks.single.mockResolvedValue({ data: { id: 'sub-456' }, error: null });

      await service.registerSubscription(userId, subscriptionData, userAgent);

      expect(mockClient._mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_agent: userAgent,
        }),
        expect.anything()
      );
    });
  });

  describe('unregisterSubscription', () => {
    it('should delete a push subscription by endpoint', async () => {
      const endpoint = 'https://push.example.com/send/abc123';

      mockClient._mocks.eq.mockResolvedValue({ error: null });

      await service.unregisterSubscription(endpoint);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockClient._mocks.delete).toHaveBeenCalled();
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('endpoint', endpoint);
    });

    it('should throw error on deletion failure', async () => {
      mockClient._mocks.eq.mockResolvedValue({
        error: { message: 'Deletion failed' },
      });

      await expect(service.unregisterSubscription('https://example.com'))
        .rejects.toThrow('Deletion failed');
    });
  });

  describe('sendNotification', () => {
    it('should send notification to a subscription', async () => {
      vi.mocked(sendPush).mockResolvedValue(pushResult(201));

      const subscription: PushSubscriptionData = {
        endpoint: 'https://push.example.com/send/abc123',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      };

      const payload: NotificationPayload = {
        title: 'New Episode',
        body: 'A new episode is available',
        icon: '/icon.png',
        data: {
          url: '/podcasts/123/episodes/456',
        },
      };

      const result = await service.sendNotification(subscription, payload);

      expect(result.success).toBe(true);
      expect(sendPush).toHaveBeenCalledWith(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        JSON.stringify(payload),
        {
          keys: { publicKey: 'test-public-key', privateKey: 'test-private-key' },
          subject: 'mailto:test@example.com',
          ttl: 60 * 60 * 24,
        }
      );
    });

    it('should return failure when notification fails', async () => {
      vi.mocked(sendPush).mockResolvedValue(pushResult(503, 'Push service unavailable'));

      const subscription: PushSubscriptionData = {
        endpoint: 'https://push.example.com/send/abc123',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      };

      const payload: NotificationPayload = {
        title: 'Test',
        body: 'Test notification',
      };

      const result = await service.sendNotification(subscription, payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Push service unavailable');
    });

    it('should handle 410 Gone response by marking subscription inactive', async () => {
      vi.mocked(sendPush).mockResolvedValue(pushResult(410, 'push service answered 410'));

      mockClient._mocks.eq.mockResolvedValue({ error: null });

      const subscription: PushSubscriptionData = {
        endpoint: 'https://push.example.com/send/abc123',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      };

      const result = await service.sendNotification(subscription, {
        title: 'Test',
        body: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.expired).toBe(true);
      expect(mockClient._mocks.update).toHaveBeenCalledWith({ is_active: false });
    });
  });

  describe('sendNotificationToUser', () => {
    it('should send notification to all active subscriptions for a user', async () => {
      const userId = 'user-123';
      const mockSubscriptions = [
        {
          id: 'sub-1',
          endpoint: 'https://push.example.com/1',
          p256dh_key: 'key1',
          auth_key: 'auth1',
          is_active: true,
        },
        {
          id: 'sub-2',
          endpoint: 'https://push.example.com/2',
          p256dh_key: 'key2',
          auth_key: 'auth2',
          is_active: true,
        },
      ];

      // Create a mock that supports chained .eq().eq() calls
      const secondEq = vi.fn().mockResolvedValue({ data: mockSubscriptions, error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      const selectMock = vi.fn().mockReturnValue({ eq: firstEq });
      mockClient._mocks.from.mockReturnValue({ select: selectMock });

      vi.mocked(sendPush).mockResolvedValue(pushResult(201));

      const payload: NotificationPayload = {
        title: 'New Episode',
        body: 'Check it out!',
      };

      const results = await service.sendNotificationToUser(userId, payload);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(sendPush).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when user has no subscriptions', async () => {
      // Create a mock that supports chained .eq().eq() calls
      const secondEq = vi.fn().mockResolvedValue({ data: [], error: null });
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      const selectMock = vi.fn().mockReturnValue({ eq: firstEq });
      mockClient._mocks.from.mockReturnValue({ select: selectMock });

      const results = await service.sendNotificationToUser('user-123', {
        title: 'Test',
        body: 'Test',
      });

      expect(results).toEqual([]);
    });
  });

  describe('recordNotification', () => {
    it('should record notification in history', async () => {
      const notificationData = {
        userId: 'user-123',
        pushSubscriptionId: 'sub-456',
        notificationType: 'new_episode',
        title: 'New Episode Available',
        body: 'Check out the latest episode',
        podcastId: 'podcast-789',
        episodeId: 'episode-012',
        status: 'sent' as const,
      };

      const mockRecord = {
        id: 'notif-123',
        ...notificationData,
        created_at: '2026-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({ data: mockRecord, error: null });

      const result = await service.recordNotification(notificationData);

      expect(result).toEqual(mockRecord);
      expect(mockClient._mocks.from).toHaveBeenCalledWith('notification_history');
      expect(mockClient._mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: notificationData.userId,
          notification_type: notificationData.notificationType,
          title: notificationData.title,
          status: 'sent',
        })
      );
    });
  });

  describe('getVapidPublicKey', () => {
    it('should return the VAPID public key', () => {
      const publicKey = service.getVapidPublicKey();
      expect(publicKey).toBe('test-public-key');
    });
  });
});
