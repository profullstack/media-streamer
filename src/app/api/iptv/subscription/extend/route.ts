/**
 * IPTV Subscription Extension API Route
 *
 * Extends existing IPTV subscriptions via ArgonTV and CoinPayPortal payments.
 * 
 * @route POST /api/iptv/subscription/extend - Create payment to extend IPTV subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getIPTVSubscriptionService,
  getIPTVSubscriptionRepository,
  isValidPackageKey,
  IPTV_PACKAGE_PRICES,
  type ArgonTVPackageKey,
} from '@/lib/argontv';
import { getCoinPayPortalClient } from '@/lib/coinpayportal';

interface ExtendRequestBody {
  packageKey: string;
  /** Ignored since hosted checkout: the buyer picks the coin (or PayPal) on CoinPay. */
  cryptoType?: string;
}

/**
 * POST /api/iptv/subscription/extend
 *
 * Create a payment to extend an existing IPTV subscription
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    let body: ExtendRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { packageKey } = body;

    // Validate package key
    if (!packageKey || !isValidPackageKey(packageKey)) {
      return NextResponse.json(
        { error: 'Invalid package. Must be one of: 1_month, 3_months, 6_months, 12_months, 24_hour_test, 3_hour_test' },
        { status: 400 }
      );
    }

    // CoinPay files the sale under the buyer's email.
    if (!user.email) {
      return NextResponse.json(
        { error: 'Add an email address to your account before subscribing.' },
        { status: 400 }
      );
    }

    const service = getIPTVSubscriptionService();
    const repository = getIPTVSubscriptionRepository();

    // Check if user has a subscription to extend
    const existingSubscription = await service.getUserSubscription(user.id);
    if (!existingSubscription?.subscription) {
      return NextResponse.json(
        { error: 'No IPTV subscription found. Please create a new subscription first.' },
        { status: 400 }
      );
    }

    // Get price for the package
    const priceUsd = IPTV_PACKAGE_PRICES[packageKey as ArgonTVPackageKey];

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

    // Create payment via CoinPayPortal API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let coinPayResponse;
    try {
      coinPayResponse = await coinPayPortal.createCheckoutSession({
        amount: priceUsd,
        customerEmail: user.email,
        accountId: user.id,
        description: `IPTV Subscription Extension - ${packageKey.replace('_', ' ')}`,
        metadata: {
          type: 'iptv_extension',
          packageKey,
          userId: user.id,
          userEmail: user.email,
          subscriptionId: existingSubscription.subscription.id,
        },
        successUrl: `${baseUrl}/account?iptv_payment=success`,
        cancelUrl: `${baseUrl}/account`,
      });
    } catch (apiError) {
      const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown payment provider error';
      console.error('CoinPayPortal API error:', errorMessage);
      return NextResponse.json(
        { error: errorMessage },
        { status: 502 }
      );
    }

    // Persist payment to database for tracking
    await repository.createPayment(user.id, {
      // Keyed by the session until the webhook re-keys it to the payment id.
      coinpayportalPaymentId: coinPayResponse.id,
      amountUsd: priceUsd,
      packageKey: packageKey as ArgonTVPackageKey,
      paymentType: 'extension',
      subscriptionId: existingSubscription.subscription.id,
      metadata: {
        userEmail: user.email,
        checkoutSessionId: coinPayResponse.id,
      },
    });

    // Return payment details with redirect URL to CoinPayPortal hosted payment page
    return NextResponse.json({
      success: true,
      payment: {
        checkoutSessionId: coinPayResponse.id,
        packageKey,
        amountUsd: priceUsd,
        status: 'pending',
      },
      subscription: {
        id: existingSubscription.subscription.id,
        currentExpiresAt: existingSubscription.subscription.expires_at,
        daysRemaining: existingSubscription.daysRemaining,
      },
      // Redirect to the CoinPay hosted checkout page (any coin or PayPal)
      paymentUrl: coinPayResponse.url,
    });
  } catch (error) {
    console.error('IPTV subscription extension error:', error);
    return NextResponse.json(
      { error: 'Failed to create extension payment' },
      { status: 500 }
    );
  }
}
