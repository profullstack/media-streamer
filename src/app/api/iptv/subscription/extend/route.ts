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
import { getCoinPayPortalClient, type CryptoBlockchain } from '@/lib/coinpayportal';

interface ExtendRequestBody {
  packageKey: string;
  cryptoType: string;
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

    const { packageKey, cryptoType } = body;

    // Validate package key
    if (!packageKey || !isValidPackageKey(packageKey)) {
      return NextResponse.json(
        { error: 'Invalid package. Must be one of: 1_month, 3_months, 6_months, 12_months, 24_hour_test, 3_hour_test' },
        { status: 400 }
      );
    }

    // Validate crypto type is provided (actual coin validation is done by the API)
    if (!cryptoType) {
      return NextResponse.json(
        { error: 'Crypto type is required' },
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

    // Use crypto type directly as the blockchain code (validated by CoinPayPortal API)
    const blockchain = cryptoType as CryptoBlockchain;

    // Create payment via CoinPayPortal API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let coinPayResponse;
    try {
      coinPayResponse = await coinPayPortal.createPayment({
        amount: priceUsd,
        blockchain,
        description: `IPTV Subscription Extension - ${packageKey.replace('_', ' ')}`,
        metadata: {
          type: 'iptv_extension',
          packageKey,
          userId: user.id,
          userEmail: user.email,
          subscriptionId: existingSubscription.subscription.id,
        },
        webhookUrl: `${baseUrl}/api/iptv/subscription/webhook`,
        redirectUrl: `${baseUrl}/account?iptv_payment=success`,
      });
    } catch (apiError) {
      const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown payment provider error';
      console.error('CoinPayPortal API error:', errorMessage);
      return NextResponse.json(
        { error: errorMessage },
        { status: 502 }
      );
    }

    if (!coinPayResponse.success || !coinPayResponse.payment) {
      console.error('CoinPayPortal API returned unsuccessful response:', coinPayResponse);
      return NextResponse.json(
        { error: 'Payment provider returned an invalid response' },
        { status: 502 }
      );
    }

    // Persist payment to database for tracking
    await repository.createPayment(user.id, {
      coinpayportalPaymentId: coinPayResponse.payment.id,
      amountUsd: priceUsd,
      packageKey: packageKey as ArgonTVPackageKey,
      paymentType: 'extension',
      subscriptionId: existingSubscription.subscription.id,
      blockchain: coinPayResponse.payment.blockchain,
      paymentAddress: coinPayResponse.payment.payment_address,
      metadata: {
        userEmail: user.email,
      },
    });

    // Return payment details with redirect URL to CoinPayPortal hosted payment page
    return NextResponse.json({
      success: true,
      payment: {
        coinPayId: coinPayResponse.payment.id,
        packageKey,
        amountUsd: priceUsd,
        cryptoType,
        cryptoAmount: coinPayResponse.payment.crypto_amount,
        paymentAddress: coinPayResponse.payment.payment_address,
        status: coinPayResponse.payment.status,
        expiresAt: coinPayResponse.payment.expires_at,
      },
      subscription: {
        id: existingSubscription.subscription.id,
        currentExpiresAt: existingSubscription.subscription.expires_at,
        daysRemaining: existingSubscription.daysRemaining,
      },
      // Redirect to CoinPayPortal hosted payment page
      paymentUrl: coinPayResponse.paymentUrl,
    });
  } catch (error) {
    console.error('IPTV subscription extension error:', error);
    return NextResponse.json(
      { error: 'Failed to create extension payment' },
      { status: 500 }
    );
  }
}
