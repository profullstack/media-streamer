/**
 * IPTV Subscription Repository
 * 
 * Server-side repository for managing IPTV subscriptions in Supabase.
 * All operations are performed server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  IptvSubscription,
  IptvSubscriptionInsert,
  IptvPaymentHistory,
  IptvPaymentHistoryInsert,
  IptvPackageKey,
  IptvSubscriptionStatus,
  IptvPaymentStatus,
  IptvPaymentType,
} from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Data required to create a new IPTV subscription
 */
export interface CreateSubscriptionData {
  argontvLineId: number;
  username: string;
  password: string;
  m3uDownloadLink: string;
  packageKey: IptvPackageKey;
  expiresAt: Date;
}

/**
 * Data required to create a new IPTV payment record
 */
export interface CreatePaymentData {
  coinpayportalPaymentId: string;
  amountUsd: number;
  packageKey: IptvPackageKey;
  paymentType: IptvPaymentType;
  subscriptionId?: string;
  blockchain?: string;
  paymentAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Data for updating payment status from webhook
 */
export interface UpdatePaymentStatusData {
  status: IptvPaymentStatus;
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
 * IPTV Subscription repository interface
 */
export interface IPTVSubscriptionRepository {
  // Subscription operations
  createSubscription(userId: string, data: CreateSubscriptionData): Promise<IptvSubscription>;
  getSubscriptionById(subscriptionId: string): Promise<IptvSubscription | null>;
  getUserSubscription(userId: string): Promise<IptvSubscription | null>;
  getSubscriptionByLineId(lineId: number): Promise<IptvSubscription | null>;
  updateSubscriptionStatus(subscriptionId: string, status: IptvSubscriptionStatus): Promise<IptvSubscription>;
  extendSubscription(subscriptionId: string, newExpiresAt: Date): Promise<IptvSubscription>;
  
  // Payment operations
  createPayment(userId: string, data: CreatePaymentData): Promise<IptvPaymentHistory>;
  getPaymentByExternalId(externalId: string): Promise<IptvPaymentHistory | null>;
  getUserPayments(userId: string, options?: GetUserPaymentsOptions): Promise<IptvPaymentHistory[]>;
  updatePaymentStatus(externalId: string, data: UpdatePaymentStatusData): Promise<IptvPaymentHistory>;
  linkPaymentToSubscription(paymentId: string, subscriptionId: string): Promise<IptvPaymentHistory>;
  completePayment(externalId: string): Promise<IptvPaymentHistory>;
}

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Create an IPTV subscription repository instance
 */
export function createIPTVSubscriptionRepository(
  client: SupabaseClient<Database>
): IPTVSubscriptionRepository {
  return {
    // ========================================================================
    // Subscription Operations
    // ========================================================================

    /**
     * Create a new IPTV subscription
     */
    async createSubscription(userId: string, data: CreateSubscriptionData): Promise<IptvSubscription> {
      const subscriptionData: IptvSubscriptionInsert = {
        user_id: userId,
        argontv_line_id: data.argontvLineId,
        username: data.username,
        password: data.password,
        m3u_download_link: data.m3uDownloadLink,
        package_key: data.packageKey,
        status: 'active',
        expires_at: data.expiresAt.toISOString(),
      };

      const { data: subscription, error } = await client
        .from('iptv_subscriptions')
        .insert(subscriptionData)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return subscription;
    },

    /**
     * Get subscription by ID
     */
    async getSubscriptionById(subscriptionId: string): Promise<IptvSubscription | null> {
      const { data, error } = await client
        .from('iptv_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
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
     * Get active subscription for a user
     */
    async getUserSubscription(userId: string): Promise<IptvSubscription | null> {
      const { data, error } = await client
        .from('iptv_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('expires_at', { ascending: false })
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
     * Get subscription by ArgonTV line ID
     */
    async getSubscriptionByLineId(lineId: number): Promise<IptvSubscription | null> {
      const { data, error } = await client
        .from('iptv_subscriptions')
        .select('*')
        .eq('argontv_line_id', lineId)
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
     * Update subscription status
     */
    async updateSubscriptionStatus(
      subscriptionId: string,
      status: IptvSubscriptionStatus
    ): Promise<IptvSubscription> {
      const { data: subscription, error } = await client
        .from('iptv_subscriptions')
        .update({ status })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return subscription;
    },

    /**
     * Extend subscription expiry date
     */
    async extendSubscription(
      subscriptionId: string,
      newExpiresAt: Date
    ): Promise<IptvSubscription> {
      const { data: subscription, error } = await client
        .from('iptv_subscriptions')
        .update({
          expires_at: newExpiresAt.toISOString(),
          status: 'active',
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return subscription;
    },

    // ========================================================================
    // Payment Operations
    // ========================================================================

    /**
     * Create a new payment record
     */
    async createPayment(userId: string, data: CreatePaymentData): Promise<IptvPaymentHistory> {
      const paymentData: IptvPaymentHistoryInsert = {
        user_id: userId,
        coinpayportal_payment_id: data.coinpayportalPaymentId,
        amount_usd: data.amountUsd,
        package_key: data.packageKey,
        payment_type: data.paymentType,
        iptv_subscription_id: data.subscriptionId ?? null,
        blockchain: data.blockchain ?? null,
        payment_address: data.paymentAddress ?? null,
        metadata: data.metadata ?? null,
        status: 'pending',
      };

      const { data: payment, error } = await client
        .from('iptv_payment_history')
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
    async getPaymentByExternalId(externalId: string): Promise<IptvPaymentHistory | null> {
      const { data, error } = await client
        .from('iptv_payment_history')
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
    ): Promise<IptvPaymentHistory[]> {
      let query = client
        .from('iptv_payment_history')
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
    ): Promise<IptvPaymentHistory> {
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
        .from('iptv_payment_history')
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
     * Link payment to subscription after creation
     */
    async linkPaymentToSubscription(
      paymentId: string,
      subscriptionId: string
    ): Promise<IptvPaymentHistory> {
      const { data: payment, error } = await client
        .from('iptv_payment_history')
        .update({ iptv_subscription_id: subscriptionId })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return payment;
    },

    /**
     * Complete a payment
     */
    async completePayment(externalId: string): Promise<IptvPaymentHistory> {
      const { data: payment, error } = await client
        .from('iptv_payment_history')
        .update({
          status: 'confirmed',
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
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getServerClient } from '../supabase/client';

let repositoryInstance: IPTVSubscriptionRepository | null = null;

/**
 * Get the singleton IPTV subscription repository instance
 * Uses the server-side Supabase client
 */
export function getIPTVSubscriptionRepository(): IPTVSubscriptionRepository {
  if (!repositoryInstance) {
    repositoryInstance = createIPTVSubscriptionRepository(getServerClient());
  }
  return repositoryInstance;
}

/**
 * Reset the repository instance (for testing)
 */
export function resetIPTVSubscriptionRepository(): void {
  repositoryInstance = null;
}
