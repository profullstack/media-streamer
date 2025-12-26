/**
 * CoinPayPortal Types
 * 
 * Type definitions for CoinPayPortal API integration
 */

export type CryptoBlockchain = 'BTC' | 'ETH' | 'POL' | 'SOL' | 'USDC_ETH' | 'USDC_POL' | 'USDC_SOL';

export interface CoinPayPortalConfig {
  apiKey: string;
  businessId: string;
  webhookSecret: string;
  baseUrl?: string;
}

export interface CreatePaymentRequest {
  amount: number;
  currency?: string;
  blockchain: CryptoBlockchain;
  business_id: string;
  description?: string;
  metadata?: Record<string, string>;
  webhook_url?: string;
  redirect_url?: string;
}

export interface PaymentResponse {
  success: boolean;
  payment: {
    id: string;
    business_id: string;
    payment_address: string;
    amount: number;
    currency: string;
    crypto_amount: string;
    blockchain: CryptoBlockchain;
    status: 'pending' | 'detected' | 'confirmed' | 'forwarding' | 'forwarded' | 'failed' | 'expired';
    expires_at: string;
    created_at: string;
    metadata?: Record<string, unknown>;
    qr_code?: string;
  };
  usage?: {
    current: number;
    limit: number;
    remaining: number;
  };
}

export interface PaymentStatusResponse {
  success: boolean;
  payment: {
    id: string;
    status: 'pending' | 'detected' | 'confirmed' | 'forwarding' | 'forwarded' | 'failed' | 'expired';
    tx_hash?: string | null;
    forward_tx_hash?: string | null;
    confirmed_at?: string | null;
    blockchain?: string;
    crypto_amount?: string;
    payment_address?: string;
  };
}

export interface WebhookPayload {
  id: string;
  type: 'payment.detected' | 'payment.confirmed' | 'payment.forwarded' | 'payment.failed' | 'payment.expired' | 'test.webhook';
  data: {
    payment_id: string;
    amount_crypto: string;
    amount_usd: string;
    currency: string;
    status: string;
    confirmations?: number;
    tx_hash?: string;
    message?: string;
    metadata?: Record<string, string>;
  };
  created_at: string;
  business_id: string;
}
