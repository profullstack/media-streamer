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
import { getCoinPayPortalClient, type CryptoBlockchain } from '@/lib/coinpayportal';

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

interface SubscriptionRequestBody {
  packageKey: string;
  cryptoType: string;
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

    const { packageKey, cryptoType } = body;

    // Validate package key
    if (!packageKey || !isValidPackageKey(packageKey)) {
      return NextResponse.json(
        { error: 'Invalid package. Must be one of: 1_month, 3_months, 6_months, 12_months, 24_hour_test, 3_hour_test' },
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

    // Map crypto type to CoinPayPortal blockchain code
    const blockchain = BLOCKCHAIN_MAP[cryptoType as ValidCryptoType];

    // Get template ID from environment
    const templateId = parseInt(process.env.IPTV_ARGON_TEMPLATE_ID ?? '0', 10);

    // Create payment via CoinPayPortal API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let coinPayResponse;
    try {
      coinPayResponse = await coinPayPortal.createPayment({
        amount: priceUsd,
        blockchain,
        description: `IPTV Subscription - ${packageKey.replace('_', ' ')}`,
        metadata: {
          type: 'iptv_subscription',
          packageKey,
          userId: user.id,
          userEmail: user.email,
          templateId: templateId.toString(),
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
      paymentType: 'new_subscription',
      blockchain: coinPayResponse.payment.blockchain,
      paymentAddress: coinPayResponse.payment.payment_address,
      metadata: {
        templateId,
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
      // Redirect to CoinPayPortal hosted payment page
      paymentUrl: coinPayResponse.paymentUrl,
    });
  } catch (error) {
    console.error('IPTV subscription payment error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
