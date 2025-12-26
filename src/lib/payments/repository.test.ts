/**
 * Payment History Repository Tests
 * 
 * TDD tests for the payment history repository that persists payment data to Supabase
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentHistory, PaymentPlan } from '../supabase/types';

// Mock types for testing
interface MockPaymentRow {
  id: string;
  user_id: string;
  coinpayportal_payment_id: string;
  amount_usd: number;
  amount_crypto: string | null;
  crypto_currency: string | null;
  blockchain: string | null;
  tx_hash: string | null;
  payment_address: string | null;
  status: string;
  plan: PaymentPlan;
  duration_months: number;
  period_start: string | null;
  period_end: string | null;
  webhook_received_at: string | null;
  webhook_event_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// Create mock Supabase client
function createMockSupabaseClient() {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();

  const chainableMock = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    single: mockSingle,
    order: mockOrder,
    limit: mockLimit,
  };

  // Make methods chainable
  mockSelect.mockReturnValue(chainableMock);
  mockInsert.mockReturnValue(chainableMock);
  mockUpdate.mockReturnValue(chainableMock);
  mockDelete.mockReturnValue(chainableMock);
  mockEq.mockReturnValue(chainableMock);
  mockOrder.mockReturnValue(chainableMock);
  mockLimit.mockReturnValue(chainableMock);

  const mockFrom = vi.fn().mockReturnValue(chainableMock);

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
      order: mockOrder,
      limit: mockLimit,
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
      order: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    };
  };
}

describe('PaymentHistoryRepository', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createPayment', () => {
    it('should create a new payment record', async () => {
      const userId = 'user-123';
      const paymentData = {
        coinpayportalPaymentId: 'cpp-pay-123',
        amountUsd: 4.99,
        plan: 'premium' as PaymentPlan,
        blockchain: 'ETH',
        paymentAddress: '0x1234567890abcdef',
      };

      const mockPayment: MockPaymentRow = {
        id: 'pay-123',
        user_id: userId,
        coinpayportal_payment_id: paymentData.coinpayportalPaymentId,
        amount_usd: paymentData.amountUsd,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: paymentData.blockchain,
        tx_hash: null,
        payment_address: paymentData.paymentAddress,
        status: 'pending',
        plan: paymentData.plan,
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: null,
        webhook_event_type: null,
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.createPayment(userId, paymentData);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('payment_history');
      expect(mockClient._mocks.insert).toHaveBeenCalled();
      expect(result.coinpayportal_payment_id).toBe(paymentData.coinpayportalPaymentId);
      expect(result.status).toBe('pending');
    });

    it('should create payment with custom duration', async () => {
      const userId = 'user-123';
      const paymentData = {
        coinpayportalPaymentId: 'cpp-pay-123',
        amountUsd: 9.99,
        plan: 'family' as PaymentPlan,
        durationMonths: 6,
      };

      const mockPayment: MockPaymentRow = {
        id: 'pay-123',
        user_id: userId,
        coinpayportal_payment_id: paymentData.coinpayportalPaymentId,
        amount_usd: paymentData.amountUsd,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: null,
        tx_hash: null,
        payment_address: null,
        status: 'pending',
        plan: paymentData.plan,
        duration_months: paymentData.durationMonths,
        period_start: null,
        period_end: null,
        webhook_received_at: null,
        webhook_event_type: null,
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.createPayment(userId, paymentData);

      expect(result.duration_months).toBe(6);
    });
  });

  describe('getPaymentByExternalId', () => {
    it('should return payment by CoinPayPortal ID', async () => {
      const externalId = 'cpp-pay-123';
      const mockPayment: MockPaymentRow = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: externalId,
        amount_usd: 4.99,
        amount_crypto: '0.0015',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xabc123',
        payment_address: '0x1234567890abcdef',
        status: 'confirmed',
        plan: 'premium',
        duration_months: 12,
        period_start: '2024-01-01T00:00:00Z',
        period_end: '2025-01-01T00:00:00Z',
        webhook_received_at: '2024-01-01T00:00:00Z',
        webhook_event_type: 'payment.confirmed',
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.getPaymentByExternalId(externalId);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('payment_history');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('coinpayportal_payment_id', externalId);
      expect(result?.coinpayportal_payment_id).toBe(externalId);
    });

    it('should return null for non-existent payment', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.getPaymentByExternalId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getUserPayments', () => {
    it('should return all payments for a user ordered by date', async () => {
      const userId = 'user-123';
      const mockPayments: MockPaymentRow[] = [
        {
          id: 'pay-2',
          user_id: userId,
          coinpayportal_payment_id: 'cpp-pay-2',
          amount_usd: 4.99,
          amount_crypto: null,
          crypto_currency: null,
          blockchain: 'ETH',
          tx_hash: null,
          payment_address: null,
          status: 'pending',
          plan: 'premium',
          duration_months: 12,
          period_start: null,
          period_end: null,
          webhook_received_at: null,
          webhook_event_type: null,
          metadata: null,
          created_at: '2024-02-01T00:00:00Z',
          updated_at: '2024-02-01T00:00:00Z',
          completed_at: null,
        },
        {
          id: 'pay-1',
          user_id: userId,
          coinpayportal_payment_id: 'cpp-pay-1',
          amount_usd: 4.99,
          amount_crypto: '0.0015',
          crypto_currency: 'ETH',
          blockchain: 'ETH',
          tx_hash: '0xabc123',
          payment_address: '0x1234567890abcdef',
          status: 'confirmed',
          plan: 'premium',
          duration_months: 12,
          period_start: '2024-01-01T00:00:00Z',
          period_end: '2025-01-01T00:00:00Z',
          webhook_received_at: '2024-01-01T00:00:00Z',
          webhook_event_type: 'payment.confirmed',
          metadata: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockClient._mocks.order.mockResolvedValue({
        data: mockPayments,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const results = await repo.getUserPayments(userId);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('payment_history');
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('user_id', userId);
      expect(mockClient._mocks.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('pay-2'); // Most recent first
    });

    it('should return empty array for user with no payments', async () => {
      mockClient._mocks.order.mockResolvedValue({
        data: [],
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const results = await repo.getUserPayments('user-no-payments');

      expect(results).toEqual([]);
    });

    it('should support pagination with limit', async () => {
      const userId = 'user-123';
      const mockPayments: MockPaymentRow[] = [
        {
          id: 'pay-1',
          user_id: userId,
          coinpayportal_payment_id: 'cpp-pay-1',
          amount_usd: 4.99,
          amount_crypto: null,
          crypto_currency: null,
          blockchain: 'ETH',
          tx_hash: null,
          payment_address: null,
          status: 'confirmed',
          plan: 'premium',
          duration_months: 12,
          period_start: null,
          period_end: null,
          webhook_received_at: null,
          webhook_event_type: null,
          metadata: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          completed_at: null,
        },
      ];

      mockClient._mocks.limit.mockResolvedValue({
        data: mockPayments,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const results = await repo.getUserPayments(userId, { limit: 10 });

      expect(mockClient._mocks.limit).toHaveBeenCalledWith(10);
      expect(results).toHaveLength(1);
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status from webhook', async () => {
      const externalId = 'cpp-pay-123';
      const updateData = {
        status: 'confirmed',
        txHash: '0xabc123',
        amountCrypto: '0.0015',
        cryptoCurrency: 'ETH',
        webhookEventType: 'payment.confirmed',
      };

      const mockPayment: MockPaymentRow = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: externalId,
        amount_usd: 4.99,
        amount_crypto: updateData.amountCrypto,
        crypto_currency: updateData.cryptoCurrency,
        blockchain: 'ETH',
        tx_hash: updateData.txHash,
        payment_address: '0x1234567890abcdef',
        status: updateData.status,
        plan: 'premium',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: updateData.webhookEventType,
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.updatePaymentStatus(externalId, updateData);

      expect(mockClient._mocks.from).toHaveBeenCalledWith('payment_history');
      expect(mockClient._mocks.update).toHaveBeenCalled();
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('coinpayportal_payment_id', externalId);
      expect(result.status).toBe('confirmed');
      expect(result.tx_hash).toBe('0xabc123');
    });

    it('should set completed_at when status is confirmed', async () => {
      const externalId = 'cpp-pay-123';
      const updateData = {
        status: 'confirmed',
        webhookEventType: 'payment.confirmed',
      };

      const mockPayment: MockPaymentRow = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: externalId,
        amount_usd: 4.99,
        amount_crypto: null,
        crypto_currency: null,
        blockchain: 'ETH',
        tx_hash: null,
        payment_address: null,
        status: 'confirmed',
        plan: 'premium',
        duration_months: 12,
        period_start: null,
        period_end: null,
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: 'payment.confirmed',
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.updatePaymentStatus(externalId, updateData);

      expect(result.completed_at).not.toBeNull();
    });
  });

  describe('completePayment', () => {
    it('should mark payment as completed with subscription period', async () => {
      const externalId = 'cpp-pay-123';
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2025-01-01');

      const mockPayment: MockPaymentRow = {
        id: 'pay-123',
        user_id: 'user-123',
        coinpayportal_payment_id: externalId,
        amount_usd: 4.99,
        amount_crypto: '0.0015',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xabc123',
        payment_address: '0x1234567890abcdef',
        status: 'confirmed',
        plan: 'premium',
        duration_months: 12,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        webhook_received_at: new Date().toISOString(),
        webhook_event_type: 'payment.confirmed',
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.completePayment(externalId, periodStart, periodEnd);

      expect(mockClient._mocks.update).toHaveBeenCalled();
      expect(result.period_start).toBe(periodStart.toISOString());
      expect(result.period_end).toBe(periodEnd.toISOString());
      expect(result.completed_at).not.toBeNull();
    });
  });

  describe('getLastCompletedPayment', () => {
    it('should return the most recent completed payment for a user', async () => {
      const userId = 'user-123';
      const mockPayment: MockPaymentRow = {
        id: 'pay-123',
        user_id: userId,
        coinpayportal_payment_id: 'cpp-pay-123',
        amount_usd: 4.99,
        amount_crypto: '0.0015',
        crypto_currency: 'ETH',
        blockchain: 'ETH',
        tx_hash: '0xabc123',
        payment_address: '0x1234567890abcdef',
        status: 'confirmed',
        plan: 'premium',
        duration_months: 12,
        period_start: '2024-01-01T00:00:00Z',
        period_end: '2025-01-01T00:00:00Z',
        webhook_received_at: '2024-01-01T00:00:00Z',
        webhook_event_type: 'payment.confirmed',
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:00:00Z',
      };

      mockClient._mocks.single.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.getLastCompletedPayment(userId);

      expect(mockClient._mocks.eq).toHaveBeenCalledWith('user_id', userId);
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('status', 'confirmed');
      expect(mockClient._mocks.order).toHaveBeenCalledWith('completed_at', { ascending: false });
      expect(result?.status).toBe('confirmed');
    });

    it('should return null if no completed payments exist', async () => {
      mockClient._mocks.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const result = await repo.getLastCompletedPayment('user-no-payments');

      expect(result).toBeNull();
    });
  });

  describe('getPendingPayments', () => {
    it('should return all pending payments for a user', async () => {
      const userId = 'user-123';
      const mockPayments: MockPaymentRow[] = [
        {
          id: 'pay-1',
          user_id: userId,
          coinpayportal_payment_id: 'cpp-pay-1',
          amount_usd: 4.99,
          amount_crypto: null,
          crypto_currency: null,
          blockchain: 'ETH',
          tx_hash: null,
          payment_address: '0x1234567890abcdef',
          status: 'pending',
          plan: 'premium',
          duration_months: 12,
          period_start: null,
          period_end: null,
          webhook_received_at: null,
          webhook_event_type: null,
          metadata: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          completed_at: null,
        },
      ];

      mockClient._mocks.order.mockResolvedValue({
        data: mockPayments,
        error: null,
      });

      const { createPaymentHistoryRepository } = await import('./repository');
      const repo = createPaymentHistoryRepository(mockClient);
      const results = await repo.getPendingPayments(userId);

      expect(mockClient._mocks.eq).toHaveBeenCalledWith('user_id', userId);
      expect(mockClient._mocks.eq).toHaveBeenCalledWith('status', 'pending');
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('pending');
    });
  });
});
