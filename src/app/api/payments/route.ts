/**
 * Payment API Route
 *
 * Creates CoinPay hosted checkout sessions for premium subscriptions: the
 * buyer picks any coin bittorrented's CoinPay business takes, or PayPal.
 * No free tier - users must pay after trial expires.
 * Persists payment records to database for tracking.
 */

import { NextResponse } from 'next/server';
import { createPaymentRequest, getSubscriptionPrice, getPaymentHistoryRepository } from '@/lib/payments';
import { getCurrentUser as getAuthUser } from '@/lib/auth';
import { getCoinPayPortalClient } from '@/lib/coinpayportal';
import type { PaymentPlan } from '@/lib/supabase/types';

// Valid plans (no free tier)
const VALID_PLANS = ['premium', 'family'] as const;
type ValidPlan = typeof VALID_PLANS[number];

interface PaymentRequestBody {
  plan: string;
  /** Ignored since hosted checkout: the buyer picks the coin (or PayPal) on CoinPay. */
  cryptoType?: string;
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

    const { plan } = body;

    // Validate plan
    if (!plan || !VALID_PLANS.includes(plan as ValidPlan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "premium" or "family"' },
        { status: 400 }
      );
    }

    // CoinPay files the sale under the buyer's email; every account has one,
    // but refuse rather than open a checkout nobody can be receipted for.
    if (!user.email) {
      return NextResponse.json(
        { error: 'Add an email address to your account before subscribing.' },
        { status: 400 }
      );
    }

    // Create local payment request for tracking
    const payment = createPaymentRequest({
      userId: user.id,
      plan: plan as ValidPlan,
      cryptoType: 'ANY',
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

    // Open a CoinPay hosted checkout session (any coin or PayPal)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let session;
    try {
      session = await coinPayPortal.createCheckoutSession({
        amount: price.usd,
        description: `BitTorrented ${plan} subscription`,
        customerEmail: user.email,
        accountId: user.id,
        metadata: {
          orderId: payment.id,
          userId: user.id,
          plan,
          userEmail: user.email,
        },
        successUrl: `${baseUrl}/account?payment=success`,
        cancelUrl: `${baseUrl}/pricing`,
      });
    } catch (apiError) {
      const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown payment provider error';
      console.error('CoinPayPortal API error:', errorMessage);
      return NextResponse.json(
        { error: errorMessage },
        { status: 502 }
      );
    }

    // Persist the order keyed by the session id; the webhook re-keys it to
    // the payment id once the buyer pays (src/lib/coinpayportal/session-payments.ts).
    const paymentRepo = getPaymentHistoryRepository();
    await paymentRepo.createPayment(user.id, {
      coinpayportalPaymentId: session.id,
      amountUsd: price.usd,
      plan: plan as PaymentPlan,
      metadata: {
        orderId: payment.id,
        userEmail: user.email,
        checkoutSessionId: session.id,
      },
    });

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        checkoutSessionId: session.id,
        plan: payment.plan,
        amountUsd: payment.amountUsd,
        status: 'pending',
      },
      // Redirect to the CoinPay hosted checkout page
      paymentUrl: session.url,
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
