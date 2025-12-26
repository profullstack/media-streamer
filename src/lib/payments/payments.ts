/**
 * Payments Module
 * 
 * CoinPayPortal crypto payments integration for premium subscriptions
 */

import { randomUUID } from 'crypto';
import { createHmac, timingSafeEqual } from 'crypto';

// Types
export type PaymentStatus = 
  | 'pending'
  | 'awaiting_payment'
  | 'confirming'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed';

export type SubscriptionPlan = 'free' | 'premium' | 'family';
export type CryptoType = 'BTC' | 'ETH' | 'LTC' | 'USDT' | 'USDC';

export interface PaymentRequest {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  cryptoType: CryptoType;
  amountUsd: number;
  status: PaymentStatus;
  createdAt: Date;
}

export interface PaymentSession {
  id: string;
  requestId: string;
  walletAddress: string;
  cryptoAmount: number;
  cryptoType: CryptoType;
  status: PaymentStatus;
  createdAt: Date;
  expiresAt: Date;
  transactionHash?: string;
  completedAt?: Date;
}

export interface SubscriptionPrice {
  plan: SubscriptionPlan;
  usd: number;
}

export interface WebhookPayload {
  event: string;
  paymentId: string;
  transactionHash?: string;
  amount: number;
  cryptoType: CryptoType;
  timestamp: string;
}

export interface WebhookResult {
  success: boolean;
  event: string;
  paymentId?: string;
  error?: string;
}

export interface CreatePaymentRequestOptions {
  userId: string;
  plan: SubscriptionPlan;
  cryptoType: CryptoType;
}

export interface CreatePaymentSessionOptions {
  requestId: string;
  walletAddress: string;
  cryptoAmount: number;
  cryptoType: CryptoType;
  expiresInMinutes: number;
}

// Subscription pricing
const SUBSCRIPTION_PRICES: Record<SubscriptionPlan, number> = {
  free: 0,
  premium: 4.99,
  family: 9.99,
};

const VALID_PLANS: SubscriptionPlan[] = ['free', 'premium', 'family'];
const VALID_EVENTS = ['payment.completed', 'payment.pending', 'payment.failed', 'payment.expired'];

/**
 * Get subscription price for a plan
 */
export function getSubscriptionPrice(plan: SubscriptionPlan): SubscriptionPrice {
  return {
    plan,
    usd: SUBSCRIPTION_PRICES[plan],
  };
}

/**
 * Create a payment request
 */
export function createPaymentRequest(options: CreatePaymentRequestOptions): PaymentRequest {
  return {
    id: generatePaymentId(),
    userId: options.userId,
    plan: options.plan,
    cryptoType: options.cryptoType,
    amountUsd: SUBSCRIPTION_PRICES[options.plan],
    status: 'pending',
    createdAt: new Date(),
  };
}

/**
 * Validate a payment request
 */
export function validatePaymentRequest(request: PaymentRequest): boolean {
  if (!request.userId || request.userId.trim() === '') {
    return false;
  }
  
  if (!VALID_PLANS.includes(request.plan)) {
    return false;
  }
  
  if (request.amountUsd <= 0) {
    return false;
  }
  
  return true;
}

/**
 * Format crypto amount for display
 */
export function formatCryptoAmount(amount: number, cryptoType: CryptoType): string {
  // Stablecoins use 2 decimal places
  if (cryptoType === 'USDT' || cryptoType === 'USDC') {
    return `${amount.toFixed(2)} ${cryptoType}`;
  }
  
  // Other cryptos use 8 decimal places
  return `${amount.toFixed(8)} ${cryptoType}`;
}

/**
 * Parse crypto amount from string
 */
export function parseCryptoAmount(amountString: string): number {
  const match = amountString.match(/^([\d.]+)/);
  if (!match) {
    return 0;
  }
  
  const parsed = parseFloat(match[1]);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Generate unique payment ID
 */
export function generatePaymentId(): string {
  return `pay-${randomUUID()}`;
}

/**
 * Create payment session
 */
export function createPaymentSession(options: CreatePaymentSessionOptions): PaymentSession {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + options.expiresInMinutes * 60 * 1000);
  
  return {
    id: `session-${randomUUID()}`,
    requestId: options.requestId,
    walletAddress: options.walletAddress,
    cryptoAmount: options.cryptoAmount,
    cryptoType: options.cryptoType,
    status: 'awaiting_payment',
    createdAt: now,
    expiresAt,
  };
}

/**
 * Get payment status
 */
export function getPaymentStatus(session: PaymentSession): PaymentStatus {
  return session.status;
}

/**
 * Update payment status
 */
export function updatePaymentStatus(
  session: PaymentSession,
  status: PaymentStatus
): PaymentSession {
  return {
    ...session,
    status,
  };
}

/**
 * Complete payment
 */
export function completePayment(
  session: PaymentSession,
  transactionHash: string
): PaymentSession {
  return {
    ...session,
    status: 'completed',
    transactionHash,
    completedAt: new Date(),
  };
}

/**
 * Cancel payment
 */
export function cancelPayment(session: PaymentSession): PaymentSession {
  return {
    ...session,
    status: 'cancelled',
  };
}

/**
 * Expire payment
 */
export function expirePayment(session: PaymentSession): PaymentSession {
  return {
    ...session,
    status: 'expired',
  };
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Signature format: sha256=<hash>
  if (!signature.startsWith('sha256=')) {
    return false;
  }
  
  const providedHash = signature.slice(7);
  const expectedHash = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(providedHash),
      Buffer.from(expectedHash)
    );
  } catch {
    return false;
  }
}

/**
 * Process webhook payload
 */
export function processWebhookPayload(payload: WebhookPayload): WebhookResult {
  if (!VALID_EVENTS.includes(payload.event)) {
    return {
      success: false,
      event: payload.event,
      error: 'Unknown event type',
    };
  }
  
  if (!payload.paymentId) {
    return {
      success: false,
      event: payload.event,
      error: 'Missing payment ID',
    };
  }
  
  return {
    success: true,
    event: payload.event,
    paymentId: payload.paymentId,
  };
}

/**
 * Calculate subscription expiry date
 */
export function calculateSubscriptionExpiry(startDate: Date, years: number): Date {
  const expiry = new Date(startDate);
  expiry.setFullYear(expiry.getFullYear() + years);
  return expiry;
}

/**
 * Check if subscription is active
 */
export function isSubscriptionActive(expiryDate: Date | null): boolean {
  if (!expiryDate) {
    return false;
  }
  
  return expiryDate.getTime() > Date.now();
}

/**
 * Get days remaining in subscription
 */
export function getSubscriptionDaysRemaining(expiryDate: Date | null): number {
  if (!expiryDate) {
    return 0;
  }
  
  const now = Date.now();
  const expiry = expiryDate.getTime();
  
  if (expiry <= now) {
    return 0;
  }
  
  const msRemaining = expiry - now;
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

/**
 * Format subscription expiry for display
 */
export function formatSubscriptionExpiry(expiryDate: Date | null): string {
  if (!expiryDate) {
    return 'Never';
  }
  
  if (expiryDate.getTime() <= Date.now()) {
    return 'Expired';
  }
  
  return expiryDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
