/**
 * Subscription API Route
 *
 * Returns the current user's subscription status including:
 * - Current tier (trial, premium, family)
 * - Active status
 * - Days remaining until expiry
 * - Whether renewal is needed
 * 
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

/**
 * Subscription status response
 */
interface SubscriptionStatusResponse {
  subscription: {
    id: string;
    tier: string;
    status: string;
    isActive: boolean;
    daysRemaining: number;
    expiresAt: string | null;
    needsRenewal: boolean;
    renewalUrl: string;
  } | null;
}

/**
 * GET /api/subscription
 *
 * Get current user's subscription status
 */
export async function GET(): Promise<NextResponse<SubscriptionStatusResponse | { error: string }>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get subscription repository
    const subscriptionRepo = getSubscriptionRepository();

    // Get subscription status
    const status = await subscriptionRepo.getSubscriptionStatus(user.id);

    if (!status) {
      return NextResponse.json(
        { subscription: null },
        {
          status: 200,
          headers: {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          },
        }
      );
    }

    // Build response
    const response: SubscriptionStatusResponse = {
      subscription: {
        id: status.subscription_id,
        tier: status.tier,
        status: status.status,
        isActive: status.is_active,
        daysRemaining: status.days_remaining,
        expiresAt: status.expires_at,
        needsRenewal: status.needs_renewal,
        renewalUrl: '/pricing',
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription status' },
      { status: 500 }
    );
  }
}
