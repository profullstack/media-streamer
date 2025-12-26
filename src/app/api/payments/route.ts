/**
 * Payment API Route
 *
 * Creates payment sessions via CoinPayPortal for premium subscriptions.
 * No free tier - users must pay after trial expires.
 * Persists payment records to database for tracking.
 */

import { NextResponse } from 'next/server';
import { createPaymentRequest, getSubscriptionPrice, getPaymentHistoryRepository } from '@/lib/payments';
import { getCurrentUser as getAuthUser } from '@/lib/auth';
import { getCoinPayPortalClient, type CryptoBlockchain } from '@/lib/coinpayportal';
import type { PaymentPlan } from '@/lib/supabase/types';

// Valid plans (no free tier)
const VALID_PLANS = ['premium', 'family'] as const;
type ValidPlan = typeof VALID_PLANS[number];

// Valid crypto types - mapped to CoinPayPortal blockchain codes
const VALID_CRYPTO_TYPES = ['BTC', 'ETH', 'LTC', 'USDT', 'USDC'] as const;
type ValidCryptoType = typeof VALID_CRYPTO_TYPES[number];

// Map our crypto types to CoinPayPortal blockchain codes
const BLOCKCHAIN_MAP: Record<ValidCryptoType, CryptoBlockchain> = {
  BTC: 'BTC',
  ETH: 'ETH',
  LTC: 'BTC', // LTC not supported, use BTC
  USDT: 'USDC_ETH', // Use USDC on Ethereum for stablecoins
  USDC: 'USDC_ETH',
};

interface PaymentRequestBody {
  plan: string;
  cryptoType: string;
}

/**
 * Get current user from auth module
 */
async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  return getAuthUser();
}

/**
 * POST /api/payments
 *
 * Create a new payment request for a subscription plan
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    let body: PaymentRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { plan, cryptoType } = body;

    // Validate plan
    if (!plan || !VALID_PLANS.includes(plan as ValidPlan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "premium" or "family"' },
        { status: 400 }
      );
    }

    // Validate crypto type
    if (!cryptoType || !VALID_CRYPTO_TYPES.includes(cryptoType as ValidCryptoType)) {
      return NextResponse.json(
        { error: 'Invalid crypto type. Must be BTC, ETH, LTC, USDT, or USDC' },
        { status: 400 }
      );
    }

    // Create local payment request for tracking
    const payment = createPaymentRequest({
      userId: user.id,
      plan: plan as ValidPlan,
      cryptoType: cryptoType as ValidCryptoType,
    });

    // Get price for the plan
    const price = getSubscriptionPrice(plan as ValidPlan);

    // Get CoinPayPortal client
    let coinPayPortal;
    try {
      coinPayPortal = getCoinPayPortalClient();
    } catch (error) {
      console.error('CoinPayPortal client error:', error);
      return NextResponse.json(
        { error: 'Payment service not configured' },
        { status: 503 }
      );
    }

    // Map crypto type to CoinPayPortal blockchain code
    const blockchain = BLOCKCHAIN_MAP[cryptoType as ValidCryptoType];

    // Create payment via CoinPayPortal API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const coinPayResponse = await coinPayPortal.createPayment({
      amount: price.usd,
      blockchain,
      description: `BitTorrented ${plan} subscription`,
      metadata: {
        orderId: payment.id,
        userId: user.id,
        plan,
        userEmail: user.email,
      },
      webhookUrl: `${baseUrl}/api/payments/webhook`,
      redirectUrl: `${baseUrl}/settings?payment=success`,
    });

    if (!coinPayResponse.success || !coinPayResponse.payment) {
      console.error('CoinPayPortal API error:', coinPayResponse);
      return NextResponse.json(
        { error: 'Failed to create payment with payment provider' },
        { status: 500 }
      );
    }

    // Persist payment to database for tracking
    const paymentRepo = getPaymentHistoryRepository();
    await paymentRepo.createPayment(user.id, {
      coinpayportalPaymentId: coinPayResponse.payment.id,
      amountUsd: price.usd,
      plan: plan as PaymentPlan,
      blockchain: coinPayResponse.payment.blockchain,
      paymentAddress: coinPayResponse.payment.payment_address,
      metadata: {
        orderId: payment.id,
        userEmail: user.email,
      },
    });

    // Return payment details with redirect URL to CoinPayPortal hosted payment page
    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        coinPayId: coinPayResponse.payment.id,
        plan: payment.plan,
        amountUsd: payment.amountUsd,
        cryptoType: payment.cryptoType,
        cryptoAmount: coinPayResponse.payment.crypto_amount,
        paymentAddress: coinPayResponse.payment.payment_address,
        status: coinPayResponse.payment.status,
        expiresAt: coinPayResponse.payment.expires_at,
      },
      // Redirect to CoinPayPortal hosted payment page
      paymentUrl: coinPayResponse.paymentUrl,
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payments
 *
 * Get user's payment history
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Fetch payment history from database
    const paymentRepo = getPaymentHistoryRepository();
    const payments = await paymentRepo.getUserPayments(user.id);

    // Transform to response format
    const paymentItems = payments.map((payment) => ({
      id: payment.id,
      coinPayId: payment.coinpayportal_payment_id,
      plan: payment.plan,
      amountUsd: payment.amount_usd,
      amountCrypto: payment.amount_crypto,
      cryptoCurrency: payment.crypto_currency,
      blockchain: payment.blockchain,
      txHash: payment.tx_hash,
      status: payment.status,
      periodStart: payment.period_start,
      periodEnd: payment.period_end,
      createdAt: payment.created_at,
      completedAt: payment.completed_at,
    }));

    return NextResponse.json({
      payments: paymentItems,
      total: paymentItems.length,
    });
  } catch (error) {
    console.error('Payment history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}
