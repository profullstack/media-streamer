/**
 * Subscription Payment History API Route Tests
 *
 * Tests for GET /api/subscription/history endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock the payments module
vi.mock('@/lib/payments', () => ({
  getPaymentHistoryRepository: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth';
import { getPaymentHistoryRepository } from '@/lib/payments';

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetPaymentHistoryRepository = vi.mocked(getPaymentHistoryRepository);

describe('GET /api/subscription/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Authentication required' });
  });

  it('returns empty payment history for user with no payments', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    const mockRepo = {
      getUserPayments: vi.fn().mockResolvedValue([]),
      createPayment: vi.fn(),
      getPaymentByExternalId: vi.fn(),
      updatePaymentStatus: vi.fn(),
      completePayment: vi.fn(),
      getLastCompletedPayment: vi.fn(),
      getPendingPayments: vi.fn(),
    };
    mockGetPaymentHistoryRepository.mockReturnValue(mockRepo);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      payments: [],
      total: 0,
    });
    expect(mockRepo.getUserPayments).toHaveBeenCalledWith('user-123');
  });

  it('returns payment history for user with payments', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    const mockPayments = [
      {
        id: 'payment-1',
        user_id: 'user-123',
        coinpayportal_payment_id: 'cpp-123',
        plan: 'premium',
        amount_usd: 99.99,
        amount_crypto: '0.0025',
        crypto_currency: 'BTC',
        blockchain: 'bitcoin',
        tx_hash: '0xabc123',
        status: 'confirmed',
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2027-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        completed_at: '2026-01-01T01:00:00Z',
        duration_months: 12,
        payment_address: null,
        metadata: null,
        webhook_received_at: null,
        webhook_event_type: null,
      },
      {
        id: 'payment-2',
        user_id: 'user-123',
        coinpayportal_payment_id: 'cpp-456',
        plan: 'premium',
        amount_usd: 99.99,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: null,
        tx_hash: null,
        status: 'pending',
        period_start: null,
        period_end: null,
        created_at: '2025-12-01T00:00:00Z',
        completed_at: null,
        duration_months: 12,
        payment_address: null,
        metadata: null,
        webhook_received_at: null,
        webhook_event_type: null,
      },
    ];

    const mockRepo = {
      getUserPayments: vi.fn().mockResolvedValue(mockPayments),
      createPayment: vi.fn(),
      getPaymentByExternalId: vi.fn(),
      updatePaymentStatus: vi.fn(),
      completePayment: vi.fn(),
      getLastCompletedPayment: vi.fn(),
      getPendingPayments: vi.fn(),
    };
    mockGetPaymentHistoryRepository.mockReturnValue(mockRepo);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.payments).toHaveLength(2);
    expect(data.payments[0]).toEqual({
      id: 'payment-1',
      plan: 'premium',
      amountUsd: 99.99,
      amountCrypto: '0.0025',
      cryptoCurrency: 'BTC',
      blockchain: 'bitcoin',
      txHash: '0xabc123',
      status: 'confirmed',
      periodStart: '2026-01-01T00:00:00Z',
      periodEnd: '2027-01-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T01:00:00Z',
    });
    expect(data.payments[1]).toEqual({
      id: 'payment-2',
      plan: 'premium',
      amountUsd: 99.99,
      amountCrypto: null,
      cryptoCurrency: null,
      blockchain: null,
      txHash: null,
      status: 'pending',
      periodStart: null,
      periodEnd: null,
      createdAt: '2025-12-01T00:00:00Z',
      completedAt: null,
    });
  });

  it('returns 500 when repository throws error', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    const mockRepo = {
      getUserPayments: vi.fn().mockRejectedValue(new Error('Database error')),
      createPayment: vi.fn(),
      getPaymentByExternalId: vi.fn(),
      updatePaymentStatus: vi.fn(),
      completePayment: vi.fn(),
      getLastCompletedPayment: vi.fn(),
      getPendingPayments: vi.fn(),
    };
    mockGetPaymentHistoryRepository.mockReturnValue(mockRepo);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to fetch payment history' });
  });

  it('sets correct cache headers', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    const mockRepo = {
      getUserPayments: vi.fn().mockResolvedValue([]),
      createPayment: vi.fn(),
      getPaymentByExternalId: vi.fn(),
      updatePaymentStatus: vi.fn(),
      completePayment: vi.fn(),
      getLastCompletedPayment: vi.fn(),
      getPendingPayments: vi.fn(),
    };
    mockGetPaymentHistoryRepository.mockReturnValue(mockRepo);

    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate'
    );
  });
});
