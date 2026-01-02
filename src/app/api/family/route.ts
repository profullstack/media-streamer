/**
 * Family Plan API Routes
 * 
 * GET /api/family - Get family plan info
 * POST /api/family - Create a family plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFamilyPlanRepository } from '@/lib/family';

/**
 * GET /api/family
 * 
 * Get the user's family plan information including members and pending invitations
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
      return NextResponse.json({ familyPlan: null });
    }

    // Get members and pending invitations
    const members = await familyRepo.getFamilyMembers(familyPlan.familyPlanId);
    const pendingInvitations = await familyRepo.getPendingInvitations(familyPlan.familyPlanId);

    return NextResponse.json({
      familyPlan,
      members,
      pendingInvitations,
    });
  } catch (error) {
    console.error('[Family] Error getting family plan:', error);
    return NextResponse.json(
      { error: 'Failed to get family plan' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/family
 * 
 * Create a new family plan for the authenticated user
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
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

    // Check if user already has a family plan
    const existingPlan = await familyRepo.getFamilyPlan(user.id);
    if (existingPlan) {
      return NextResponse.json(
        { error: 'You are already a member of a family plan' },
        { status: 400 }
      );
    }

    // Create the family plan
    const familyPlan = await familyRepo.createFamilyPlan(user.id, user.email);

    return NextResponse.json({ familyPlan }, { status: 201 });
  } catch (error) {
    console.error('[Family] Error creating family plan:', error);
    return NextResponse.json(
      { error: 'Failed to create family plan' },
      { status: 500 }
    );
  }
}
