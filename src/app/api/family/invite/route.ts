/**
 * Family Invitation API Routes
 * 
 * POST /api/family/invite - Send a family invitation
 * DELETE /api/family/invite - Revoke a pending invitation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFamilyPlanRepository, generateInviteCode } from '@/lib/family';
import { getEmailService } from '@/lib/email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_EXPIRY_DAYS = 7;

/**
 * POST /api/family/invite
 * 
 * Send a family invitation to an email address
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
    const { email } = body as { email?: string };

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'Valid email address is required' },
        { status: 400 }
      );
    }

    const familyRepo = getFamilyPlanRepository();

    // Get user's family plan
    const familyPlan = await familyRepo.getFamilyPlan(user.id);
    if (!familyPlan) {
      return NextResponse.json(
        { error: 'You do not have a family plan' },
        { status: 404 }
      );
    }

    // Check if user has permission to invite
    if (familyPlan.userRole !== 'owner' && familyPlan.userRole !== 'admin') {
      return NextResponse.json(
        { error: 'You do not have permission to invite members' },
        { status: 403 }
      );
    }

    // Check if can invite more members
    const canInvite = await familyRepo.canInviteMember(familyPlan.familyPlanId);
    if (!canInvite) {
      return NextResponse.json(
        { error: 'Family plan has reached the maximum of 10 members' },
        { status: 400 }
      );
    }

    // Check if email is already a member
    const members = await familyRepo.getFamilyMembers(familyPlan.familyPlanId);
    const existingMember = members.find(m => m.email.toLowerCase() === email.toLowerCase());
    if (existingMember) {
      return NextResponse.json(
        { error: 'This email is already a member of your family plan' },
        { status: 400 }
      );
    }

    // Check for existing pending invitation
    const pendingInvitations = await familyRepo.getPendingInvitations(familyPlan.familyPlanId);
    const existingInvitation = pendingInvitations.find(
      i => i.inviteeEmail.toLowerCase() === email.toLowerCase()
    );
    if (existingInvitation) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email' },
        { status: 400 }
      );
    }

    // Generate invite code and expiry
    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Create invitation in database
    const invitation = await familyRepo.createInvitation({
      familyPlanId: familyPlan.familyPlanId,
      inviterId: user.id,
      inviterEmail: user.email,
      inviteeEmail: email,
      inviteCode,
      expiresAt,
    });

    // Send invitation email
    try {
      const emailService = getEmailService();
      await emailService.sendFamilyInvitation({
        to: email,
        inviterName: user.email.split('@')[0], // Use email prefix as name
        inviterEmail: user.email,
        familyPlanName: familyPlan.planName,
        inviteCode,
        expiresAt,
      });
    } catch (emailError) {
      console.error('[Family Invite] Failed to send email:', emailError);
      // Don't fail the request if email fails - invitation is still created
    }

    return NextResponse.json({
      invitation: {
        invitationId: invitation.id,
        inviteeEmail: invitation.invitee_email,
        inviteCode: invitation.invite_code,
        expiresAt: invitation.expires_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[Family Invite] Error sending invitation:', error);
    return NextResponse.json(
      { error: 'Failed to send invitation' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/family/invite
 * 
 * Revoke a pending invitation
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

    // Get invitation ID from query params
    const { searchParams } = new URL(request.url);
    const invitationId = searchParams.get('invitationId');

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
        { status: 400 }
      );
    }

    const familyRepo = getFamilyPlanRepository();

    // Revoke the invitation
    const result = await familyRepo.revokeInvitation(invitationId, user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Family Invite] Error revoking invitation:', error);
    return NextResponse.json(
      { error: 'Failed to revoke invitation' },
      { status: 500 }
    );
  }
}
