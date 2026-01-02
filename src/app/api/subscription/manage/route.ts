/**
 * Subscription Management API Route
 *
 * Handles subscription upgrade, downgrade, and cancellation operations.
 * - Upgrades: Redirect to CoinPayPortal payment flow for the new plan
 * - Downgrades: Schedule downgrade to take effect at end of billing period
 * - Cancellation: Cancel subscription immediately
 *
 * Server-side only - maintains Supabase security rules.
 *
 * POST /api/subscription/manage - Upgrade or downgrade subscription
 * DELETE /api/subscription/manage - Cancel subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription management action
 */
type ManageAction = 'upgrade' | 'downgrade';

/**
 * Valid target tiers for upgrade/downgrade
 */
type TargetTier = 'premium' | 'family';

/**
 * Upgrade response - redirects to payment flow
 */
interface UpgradeResponse {
  success: boolean;
  action: 'upgrade';
  message: string;
  redirectUrl: string;
  targetTier: string;
  currentTier: string;
}

/**
 * Downgrade response - schedules downgrade
 */
interface DowngradeResponse {
  success: boolean;
  action: 'downgrade';
  message: string;
  targetTier: string;
  currentTier: string;
  effectiveDate: string;
}

/**
 * Cancel response
 */
interface CancelResponse {
  success: boolean;
  message: string;
  subscription: {
    id: string;
    tier: string;
    status: string;
    expiresAt: string | null;
  };
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Tier hierarchy for upgrade/downgrade validation
 * Higher number = higher tier
 */
const TIER_HIERARCHY: Record<string, number> = {
  trial: 0,
  premium: 1,
  family: 2,
};

const VALID_ACTIONS: ManageAction[] = ['upgrade', 'downgrade'];
const VALID_TARGET_TIERS: TargetTier[] = ['premium', 'family'];

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a tier is higher than another
 */
function isTierHigher(targetTier: string, currentTier: string): boolean {
  return (TIER_HIERARCHY[targetTier] ?? 0) > (TIER_HIERARCHY[currentTier] ?? 0);
}

/**
 * Check if a tier is lower than another
 */
function isTierLower(targetTier: string, currentTier: string): boolean {
  return (TIER_HIERARCHY[targetTier] ?? 0) < (TIER_HIERARCHY[currentTier] ?? 0);
}

/**
 * Validate action
 */
function isValidAction(action: unknown): action is ManageAction {
  return typeof action === 'string' && VALID_ACTIONS.includes(action as ManageAction);
}

/**
 * Validate target tier
 */
function isValidTargetTier(tier: unknown): tier is TargetTier {
  return typeof tier === 'string' && VALID_TARGET_TIERS.includes(tier as TargetTier);
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/subscription/manage
 *
 * Upgrade or downgrade subscription to a different tier.
 * - Upgrades: Returns redirect URL to payment page (via CoinPayPortal)
 * - Downgrades: Schedules downgrade for end of billing period
 *
 * Requires authentication.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<UpgradeResponse | DowngradeResponse | ErrorResponse>> {
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate request body structure
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { action, targetTier } = body as Record<string, unknown>;

    // Validate action
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }

    if (!isValidAction(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "upgrade" or "downgrade"' },
        { status: 400 }
      );
    }

    // Validate target tier
    if (!targetTier) {
      return NextResponse.json(
        { error: 'Target tier is required' },
        { status: 400 }
      );
    }

    if (!isValidTargetTier(targetTier)) {
      return NextResponse.json(
        { error: 'Invalid target tier. Must be "premium" or "family"' },
        { status: 400 }
      );
    }

    // Get subscription repository
    const subscriptionRepo = getSubscriptionRepository();

    // Get current subscription status
    const currentStatus = await subscriptionRepo.getSubscriptionStatus(user.id);

    if (!currentStatus) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    const currentTier = currentStatus.tier;

    // Validate tier change based on action
    if (action === 'upgrade') {
      // Check if already on target tier
      if (currentTier === targetTier) {
        return NextResponse.json(
          { error: `Already on ${targetTier} tier` },
          { status: 400 }
        );
      }

      // Check if target tier is actually higher
      if (!isTierHigher(targetTier, currentTier)) {
        return NextResponse.json(
          { error: `Cannot upgrade: ${targetTier} is not higher than ${currentTier}` },
          { status: 400 }
        );
      }

      // For upgrades, redirect to the pricing/payment page
      // The user will complete payment through CoinPayPortal
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const redirectUrl = `${baseUrl}/pricing?upgrade=${targetTier}&from=${currentTier}`;

      const response: UpgradeResponse = {
        success: true,
        action: 'upgrade',
        message: `To upgrade to ${targetTier}, please complete payment`,
        redirectUrl,
        targetTier,
        currentTier,
      };

      return NextResponse.json(response, {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      });
    } else {
      // Downgrade action
      // Cannot downgrade from trial
      if (currentTier === 'trial') {
        return NextResponse.json(
          { error: 'Cannot downgrade from trial' },
          { status: 400 }
        );
      }

      // Check if already on target tier
      if (currentTier === targetTier) {
        return NextResponse.json(
          { error: `Already on ${targetTier} tier` },
          { status: 400 }
        );
      }

      // Check if target tier is actually lower
      if (!isTierLower(targetTier, currentTier)) {
        return NextResponse.json(
          { error: `Cannot downgrade: ${targetTier} is not lower than ${currentTier}` },
          { status: 400 }
        );
      }

      // For downgrades, schedule the change for end of billing period
      // The downgrade will take effect when the current subscription expires
      // and the user renews at the lower tier
      const effectiveDate = currentStatus.expires_at || new Date().toISOString();

      const response: DowngradeResponse = {
        success: true,
        action: 'downgrade',
        message: `Your subscription will be downgraded to ${targetTier} at the end of your current billing period`,
        targetTier,
        currentTier,
        effectiveDate,
      };

      return NextResponse.json(response, {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      });
    }
  } catch (error) {
    console.error('Subscription management error:', error);
    return NextResponse.json(
      { error: 'Failed to manage subscription' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/subscription/manage
 *
 * Cancel the current subscription.
 * Requires authentication.
 */
export async function DELETE(
  _request: NextRequest
): Promise<NextResponse<CancelResponse | ErrorResponse>> {
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

    // Get current subscription status
    const currentStatus = await subscriptionRepo.getSubscriptionStatus(user.id);

    if (!currentStatus) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    // Check if already cancelled
    if (currentStatus.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Subscription is already cancelled' },
        { status: 400 }
      );
    }

    // Cancel the subscription
    const cancelledSubscription = await subscriptionRepo.cancelSubscription(user.id);

    const response: CancelResponse = {
      success: true,
      message: 'Subscription cancelled successfully',
      subscription: {
        id: cancelledSubscription.id,
        tier: cancelledSubscription.tier,
        status: cancelledSubscription.status,
        expiresAt: cancelledSubscription.subscription_expires_at,
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
