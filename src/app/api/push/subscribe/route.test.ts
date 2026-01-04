/**
 * Push Subscribe API Route Tests
 *
 * Tests for push notification subscription endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the push notification service
vi.mock('@/lib/push-notifications', () => ({
  getPushNotificationService: vi.fn(),
}));

// Mock the supabase client
vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

import { GET, POST, DELETE } from './route';
import { getPushNotificationService } from '@/lib/push-notifications';
import { createServerClient } from '@/lib/supabase';

describe('Push Subscribe API Routes', () => {
  const mockService = {
    getVapidPublicKey: vi.fn(),
    registerSubscription: vi.fn(),
    unregisterSubscription: vi.fn(),
  };

  const mockSupabase = {
    auth: {
      setSession: vi.fn(),
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getPushNotificationService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
    (createServerClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);
  });

  function createRequest(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): NextRequest {
    const requestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    };

    return new NextRequest(new URL(url, 'http://localhost:3000'), requestInit);
  }

  function mockAuthenticatedUser(userId: string): void {
    mockSupabase.auth.setSession.mockResolvedValue({ error: null });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
  }

  function mockUnauthenticated(): void {
    mockSupabase.auth.setSession.mockResolvedValue({ error: { message: 'Invalid session' } });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });
  }

  describe('GET /api/push/subscribe', () => {
    it('should return vapidPublicKey', async () => {
      const mockPublicKey = 'BNxdGg2vmRYBT1Yh-xat4z_Y6SrI3k5GYl_bOYEb2JvWMiMBGpXs4Y8U-_Ls_9Yz_Yw';
      mockService.getVapidPublicKey.mockReturnValue(mockPublicKey);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.vapidPublicKey).toBe(mockPublicKey);
      expect(mockService.getVapidPublicKey).toHaveBeenCalled();
    });

    it('should return 503 when push notifications not configured', async () => {
      mockService.getVapidPublicKey.mockImplementation(() => {
        throw new Error('VAPID keys not configured');
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Push notifications not configured');
    });
  });

  describe('POST /api/push/subscribe', () => {
    const validSubscription = {
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        keys: {
          p256dh: 'BNxdGg2vmRYBT1Yh-xat4z_Y6SrI3k5GYl_bOYEb2JvWMiMBGpXs4Y8U',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
      },
    };

    it('should register a push subscription', async () => {
      mockAuthenticatedUser('user-123');
      mockService.registerSubscription.mockResolvedValue({
        id: 'sub-456',
        user_id: 'user-123',
        endpoint: validSubscription.subscription.endpoint,
      });

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/push/subscribe',
        validSubscription,
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.subscriptionId).toBe('sub-456');
      expect(mockService.registerSubscription).toHaveBeenCalledWith(
        'user-123',
        validSubscription.subscription,
        undefined
      );
    });

    it('should return 401 without authentication', async () => {
      mockUnauthenticated();

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/push/subscribe',
        validSubscription
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 for invalid subscription data', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/push/subscribe',
        { subscription: { endpoint: 'invalid' } },
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid subscription data');
    });

    it('should return 400 for missing subscription', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'POST',
        'http://localhost:3000/api/push/subscribe',
        {},
        { Authorization: 'Bearer test-token' }
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid subscription data');
    });
  });

  describe('DELETE /api/push/subscribe', () => {
    it('should unregister a push subscription', async () => {
      mockAuthenticatedUser('user-123');
      mockService.unregisterSubscription.mockResolvedValue(undefined);

      const endpoint = encodeURIComponent('https://fcm.googleapis.com/fcm/send/abc123');
      const request = createRequest(
        'DELETE',
        `http://localhost:3000/api/push/subscribe?endpoint=${endpoint}`,
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockService.unregisterSubscription).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/fcm/send/abc123'
      );
    });

    it('should return 401 without authentication', async () => {
      mockUnauthenticated();

      const request = createRequest(
        'DELETE',
        'http://localhost:3000/api/push/subscribe?endpoint=test'
      );
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when endpoint is missing', async () => {
      mockAuthenticatedUser('user-123');

      const request = createRequest(
        'DELETE',
        'http://localhost:3000/api/push/subscribe',
        undefined,
        { Authorization: 'Bearer test-token' }
      );
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required parameter: endpoint');
    });
  });
});
