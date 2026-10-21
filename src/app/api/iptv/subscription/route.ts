/**
 * IPTV Subscription API Route
 *
 * Manages IPTV subscriptions via ArgonTV and CoinPayPortal payments.
 * 
 * @route GET /api/iptv/subscription - Get user's IPTV subscription
 * @route POST /api/iptv/subscription - Create payment for new IPTV subscription
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

interface SubscriptionRequestBody {
  packageKey: string;
  /** Ignored since hosted checkout: the buyer picks the coin (or PayPal) on CoinPay. */
  cryptoType?: string;
}

/**
 * GET /api/iptv/subscription
 *
 * Get user's current IPTV subscription and available packages
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

    const service = getIPTVSubscriptionService();
    
    // Get user's subscription
    const subscriptionInfo = await service.getUserSubscription(user.id);
    
    // Get available packages
    const packages = service.getPackagePricing();

    return NextResponse.json({
      subscription: subscriptionInfo?.subscription ?? null,
      isActive: subscriptionInfo?.isActive ?? false,
      daysRemaining: subscriptionInfo?.daysRemaining ?? 0,
      packages,
    });
  } catch (error) {
    console.error('IPTV subscription fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/iptv/subscription
 *
 * Create a payment for a new IPTV subscription
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
    let body: SubscriptionRequestBody;
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

    // Check if user already has an active subscription
    const existingSubscription = await service.getUserSubscription(user.id);
    if (existingSubscription?.isActive) {
      return NextResponse.json(
        { error: 'You already have an active IPTV subscription. Use the extend endpoint to add more time.' },
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

    // Get template ID from environment
    const templateId = parseInt(process.env.IPTV_ARGON_TEMPLATE_ID ?? '0', 10);

    // Create payment via CoinPayPortal API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let coinPayResponse;
    try {
      coinPayResponse = await coinPayPortal.createCheckoutSession({
        amount: priceUsd,
        customerEmail: user.email,
        accountId: user.id,
        description: `IPTV Subscription - ${packageKey.replace('_', ' ')}`,
        metadata: {
          type: 'iptv_subscription',
          packageKey,
          userId: user.id,
          userEmail: user.email,
          templateId: templateId.toString(),
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
      paymentType: 'new_subscription',
      metadata: {
        templateId,
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
      // Redirect to the CoinPay hosted checkout page (any coin or PayPal)
      paymentUrl: coinPayResponse.url,
    });
  } catch (error) {
    console.error('IPTV subscription payment error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
