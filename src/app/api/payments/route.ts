/**
 * Payment API Route
 *
 * Creates payment sessions via CoinPayPortal for premium subscriptions.
 * No free tier - users must pay after trial expires.
 */

import { NextResponse } from 'next/server';
import { createPaymentRequest, getSubscriptionPrice } from '@/lib/payments';
import { getCurrentUser as getAuthUser } from '@/lib/auth';

// Valid plans (no free tier)
const VALID_PLANS = ['premium', 'family'] as const;
type ValidPlan = typeof VALID_PLANS[number];

// Valid crypto types
const VALID_CRYPTO_TYPES = ['BTC', 'ETH', 'LTC', 'USDT', 'USDC'] as const;
type ValidCryptoType = typeof VALID_CRYPTO_TYPES[number];

// CoinPayPortal base URL (would be configured via env in production)
const COINPAYPORTAL_URL = process.env.COINPAYPORTAL_URL || 'https://coinpayportal.com/pay';

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

    // Create payment request
    const payment = createPaymentRequest({
      userId: user.id,
      plan: plan as ValidPlan,
      cryptoType: cryptoType as ValidCryptoType,
    });

    // Get price for the plan
    const price = getSubscriptionPrice(plan as ValidPlan);

    // Generate CoinPayPortal payment URL
    const paymentUrl = `${COINPAYPORTAL_URL}?` + new URLSearchParams({
      merchant: process.env.COINPAYPORTAL_MERCHANT_ID || 'bittorrented',
      amount: price.usd.toString(),
      currency: cryptoType,
      orderId: payment.id,
      description: `BitTorrented ${plan} subscription`,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/webhook`,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/settings?payment=success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pricing?payment=cancelled`,
    }).toString();

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        plan: payment.plan,
        amountUsd: payment.amountUsd,
        cryptoType: payment.cryptoType,
        status: payment.status,
      },
      paymentUrl,
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

    // In production, this would fetch from Supabase
    // For now, return empty array
    const payments: unknown[] = [];

    return NextResponse.json({
      payments,
    });
  } catch (error) {
    console.error('Payment history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}
