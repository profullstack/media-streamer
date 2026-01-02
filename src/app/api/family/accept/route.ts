/**
 * Family Invitation Accept API Route
 * 
 * POST /api/family/accept - Accept a family invitation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFamilyPlanRepository } from '@/lib/family';

/**
 * POST /api/family/accept
 * 
 * Accept a family invitation using an invite code
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { inviteCode } = body as { inviteCode?: string };

    if (!inviteCode || inviteCode.trim() === '') {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      );
    }

    const familyRepo = getFamilyPlanRepository();

    // Check if user is already in a family plan
    const existingPlan = await familyRepo.getFamilyPlan(user.id);
    if (existingPlan) {
      return NextResponse.json(
        { error: 'You are already a member of a family plan' },
        { status: 400 }
      );
    }

    // Accept the invitation
    const result = await familyRepo.acceptInvitation(
      inviteCode.trim().toUpperCase(),
      user.id,
      user.email
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Get the family plan info
    const familyPlan = await familyRepo.getFamilyPlan(user.id);

    return NextResponse.json({
      success: true,
      message: result.message,
      familyPlan,
    });
  } catch (error) {
    console.error('[Family Accept] Error accepting invitation:', error);
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    );
  }
}
