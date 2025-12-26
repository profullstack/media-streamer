/**
 * Payment History Repository
 * 
 * Server-side repository for managing payment history in Supabase.
 * All operations are performed server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  PaymentHistory,
  PaymentHistoryInsert,
  PaymentPlan,
} from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Data required to create a new payment record
 */
export interface CreatePaymentData {
  coinpayportalPaymentId: string;
  amountUsd: number;
  plan: PaymentPlan;
  durationMonths?: number;
  blockchain?: string;
  paymentAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Data for updating payment status from webhook
 */
export interface UpdatePaymentStatusData {
  status: string;
  txHash?: string;
  amountCrypto?: string;
  cryptoCurrency?: string;
  webhookEventType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Options for fetching user payments
 */
export interface GetUserPaymentsOptions {
  limit?: number;
  offset?: number;
}

/**
 * Payment history repository interface
 */
export interface PaymentHistoryRepository {
  createPayment(userId: string, data: CreatePaymentData): Promise<PaymentHistory>;
  getPaymentByExternalId(externalId: string): Promise<PaymentHistory | null>;
  getUserPayments(userId: string, options?: GetUserPaymentsOptions): Promise<PaymentHistory[]>;
  updatePaymentStatus(externalId: string, data: UpdatePaymentStatusData): Promise<PaymentHistory>;
  completePayment(externalId: string, periodStart: Date, periodEnd: Date): Promise<PaymentHistory>;
  getLastCompletedPayment(userId: string): Promise<PaymentHistory | null>;
  getPendingPayments(userId: string): Promise<PaymentHistory[]>;
}

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Create a payment history repository instance
 */
export function createPaymentHistoryRepository(
  client: SupabaseClient<Database>
): PaymentHistoryRepository {
  return {
    /**
     * Create a new payment record
     */
    async createPayment(userId: string, data: CreatePaymentData): Promise<PaymentHistory> {
      const paymentData: PaymentHistoryInsert = {
        user_id: userId,
        coinpayportal_payment_id: data.coinpayportalPaymentId,
        amount_usd: data.amountUsd,
        plan: data.plan,
        duration_months: data.durationMonths ?? 12,
        blockchain: data.blockchain ?? null,
        payment_address: data.paymentAddress ?? null,
        metadata: data.metadata ?? null,
        status: 'pending',
      };

      const { data: payment, error } = await client
        .from('payment_history')
        .insert(paymentData)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return payment;
    },

    /**
     * Get payment by CoinPayPortal payment ID
     */
    async getPaymentByExternalId(externalId: string): Promise<PaymentHistory | null> {
      const { data, error } = await client
        .from('payment_history')
        .select('*')
        .eq('coinpayportal_payment_id', externalId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Get all payments for a user
     */
    async getUserPayments(
      userId: string,
      options: GetUserPaymentsOptions = {}
    ): Promise<PaymentHistory[]> {
      let query = client
        .from('payment_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },

    /**
     * Update payment status from webhook
     */
    async updatePaymentStatus(
      externalId: string,
      data: UpdatePaymentStatusData
    ): Promise<PaymentHistory> {
      const updateData: Record<string, unknown> = {
        status: data.status,
        webhook_received_at: new Date().toISOString(),
      };

      if (data.txHash) {
        updateData.tx_hash = data.txHash;
      }

      if (data.amountCrypto) {
        updateData.amount_crypto = data.amountCrypto;
      }

      if (data.cryptoCurrency) {
        updateData.crypto_currency = data.cryptoCurrency;
      }

      if (data.webhookEventType) {
        updateData.webhook_event_type = data.webhookEventType;
      }

      if (data.metadata) {
        updateData.metadata = data.metadata;
      }

      // Set completed_at if status is confirmed
      if (data.status === 'confirmed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { data: payment, error } = await client
        .from('payment_history')
        .update(updateData)
        .eq('coinpayportal_payment_id', externalId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return payment;
    },

    /**
     * Complete a payment with subscription period
     */
    async completePayment(
      externalId: string,
      periodStart: Date,
      periodEnd: Date
    ): Promise<PaymentHistory> {
      const { data: payment, error } = await client
        .from('payment_history')
        .update({
          status: 'confirmed',
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('coinpayportal_payment_id', externalId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return payment;
    },

    /**
     * Get the most recent completed payment for a user
     */
    async getLastCompletedPayment(userId: string): Promise<PaymentHistory | null> {
      const { data, error } = await client
        .from('payment_history')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data;
    },

    /**
     * Get all pending payments for a user
     */
    async getPendingPayments(userId: string): Promise<PaymentHistory[]> {
      const { data, error } = await client
        .from('payment_history')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getServerClient } from '../supabase/client';

let repositoryInstance: PaymentHistoryRepository | null = null;

/**
 * Get the singleton payment history repository instance
 * Uses the server-side Supabase client
 */
export function getPaymentHistoryRepository(): PaymentHistoryRepository {
  if (!repositoryInstance) {
    repositoryInstance = createPaymentHistoryRepository(getServerClient());
  }
  return repositoryInstance;
}

/**
 * Reset the repository instance (for testing)
 */
export function resetPaymentHistoryRepository(): void {
  repositoryInstance = null;
}
