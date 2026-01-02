/**
 * Family Members API Routes
 * 
 * GET /api/family/members - Get all family members
 * DELETE /api/family/members - Remove a family member
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFamilyPlanRepository } from '@/lib/family';

/**
 * GET /api/family/members
 * 
 * Get all members of the user's family plan
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const familyRepo = getFamilyPlanRepository();

    // Get user's family plan
    const familyPlan = await familyRepo.getFamilyPlan(user.id);
    if (!familyPlan) {
      return NextResponse.json(
        { error: 'You are not a member of a family plan' },
        { status: 404 }
      );
    }

    // Get members
    const members = await familyRepo.getFamilyMembers(familyPlan.familyPlanId);

    return NextResponse.json({ members });
  } catch (error) {
    console.error('[Family Members] Error getting members:', error);
    return NextResponse.json(
      { error: 'Failed to get family members' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/family/members
 * 
 * Remove a member from the family plan
 * Owner/admin can remove members, members can remove themselves
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get member ID from query params
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      );
    }

    const familyRepo = getFamilyPlanRepository();

    // Get user's family plan
    const familyPlan = await familyRepo.getFamilyPlan(user.id);
    if (!familyPlan) {
      return NextResponse.json(
        { error: 'You are not a member of a family plan' },
        { status: 404 }
      );
    }

    // Remove the member
    const result = await familyRepo.removeMember(
      familyPlan.familyPlanId,
      memberId,
      user.id
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error('[Family Members] Error removing member:', error);
    return NextResponse.json(
      { error: 'Failed to remove family member' },
      { status: 500 }
    );
  }
}
