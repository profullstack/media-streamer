-- Family Plans and Invitations Schema
-- This migration adds tables for managing family plan memberships and invitations

-- ============================================
-- FAMILY PLANS TABLE
-- ============================================
-- Tracks family plan groups (one per family plan subscription owner)
CREATE TABLE family_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    plan_name VARCHAR(100) NOT NULL DEFAULT 'My Family',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for family_plans
CREATE INDEX idx_family_plans_owner_id ON family_plans(owner_id);

-- Trigger for updated_at
CREATE TRIGGER update_family_plans_updated_at
    BEFORE UPDATE ON family_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FAMILY MEMBERS TABLE
-- ============================================
-- Tracks members of each family plan
CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_plan_id UUID REFERENCES family_plans(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Each user can only be in one family plan
    UNIQUE(user_id),
    -- Each email can only be in one family plan
    UNIQUE(family_plan_id, email)
);

-- Indexes for family_members
CREATE INDEX idx_family_members_family_plan_id ON family_members(family_plan_id);
CREATE INDEX idx_family_members_user_id ON family_members(user_id);
CREATE INDEX idx_family_members_email ON family_members(email);

-- Trigger for updated_at
CREATE TRIGGER update_family_members_updated_at
    BEFORE UPDATE ON family_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FAMILY INVITATIONS TABLE
-- ============================================
-- Tracks pending invitations to join a family plan
CREATE TABLE family_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_plan_id UUID REFERENCES family_plans(id) ON DELETE CASCADE NOT NULL,
    inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    inviter_email VARCHAR(255) NOT NULL,
    invitee_email VARCHAR(255) NOT NULL,
    invite_code VARCHAR(32) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')) DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index to prevent duplicate pending invitations to the same email for the same family
CREATE UNIQUE INDEX idx_family_invitations_pending_unique
    ON family_invitations(family_plan_id, invitee_email)
    WHERE status = 'pending';

-- Indexes for family_invitations
CREATE INDEX idx_family_invitations_family_plan_id ON family_invitations(family_plan_id);
CREATE INDEX idx_family_invitations_invitee_email ON family_invitations(invitee_email);
CREATE INDEX idx_family_invitations_invite_code ON family_invitations(invite_code);
CREATE INDEX idx_family_invitations_status ON family_invitations(status);
CREATE INDEX idx_family_invitations_expires_at ON family_invitations(expires_at);

-- Trigger for updated_at
CREATE TRIGGER update_family_invitations_updated_at
    BEFORE UPDATE ON family_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE family_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;

-- Family plans policies
CREATE POLICY "Users can view their own family plan"
    ON family_plans FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can view family plan they belong to"
    ON family_plans FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM family_members 
            WHERE family_members.family_plan_id = family_plans.id 
            AND family_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage family plans"
    ON family_plans FOR ALL
    USING (auth.role() = 'service_role');

-- Family members policies
CREATE POLICY "Users can view members of their family plan"
    ON family_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM family_members fm 
            WHERE fm.family_plan_id = family_members.family_plan_id 
            AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage family members"
    ON family_members FOR ALL
    USING (auth.role() = 'service_role');

-- Family invitations policies
CREATE POLICY "Users can view invitations they sent"
    ON family_invitations FOR SELECT
    USING (auth.uid() = inviter_id);

CREATE POLICY "Users can view invitations sent to their email"
    ON family_invitations FOR SELECT
    USING (
        invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

CREATE POLICY "Service role can manage family invitations"
    ON family_invitations FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to create a family plan when user upgrades to family tier
CREATE OR REPLACE FUNCTION create_family_plan_for_user(
    p_user_id UUID,
    p_user_email TEXT,
    p_plan_name TEXT DEFAULT 'My Family'
)
RETURNS family_plans AS $$
DECLARE
    v_plan family_plans;
BEGIN
    -- Create the family plan
    INSERT INTO family_plans (owner_id, plan_name)
    VALUES (p_user_id, p_plan_name)
    ON CONFLICT (owner_id) DO UPDATE SET updated_at = NOW()
    RETURNING * INTO v_plan;
    
    -- Add owner as first member
    INSERT INTO family_members (family_plan_id, user_id, email, role)
    VALUES (v_plan.id, p_user_id, p_user_email, 'owner')
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN v_plan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get family plan member count
CREATE OR REPLACE FUNCTION get_family_member_count(p_family_plan_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM family_members 
        WHERE family_plan_id = p_family_plan_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can invite more members (max 10)
CREATE OR REPLACE FUNCTION can_invite_family_member(p_family_plan_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_family_member_count(p_family_plan_id) < 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get family plan for a user (either as owner or member)
CREATE OR REPLACE FUNCTION get_user_family_plan(p_user_id UUID)
RETURNS TABLE (
    family_plan_id UUID,
    plan_name VARCHAR(100),
    owner_id UUID,
    owner_email TEXT,
    member_count INTEGER,
    user_role VARCHAR(20),
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fp.id as family_plan_id,
        fp.plan_name,
        fp.owner_id,
        au.email as owner_email,
        get_family_member_count(fp.id) as member_count,
        fm.role as user_role,
        fp.created_at
    FROM family_plans fp
    JOIN family_members fm ON fm.family_plan_id = fp.id AND fm.user_id = p_user_id
    JOIN auth.users au ON au.id = fp.owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all members of a family plan
CREATE OR REPLACE FUNCTION get_family_members(p_family_plan_id UUID)
RETURNS TABLE (
    member_id UUID,
    user_id UUID,
    email VARCHAR(255),
    role VARCHAR(20),
    joined_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fm.id as member_id,
        fm.user_id,
        fm.email,
        fm.role,
        fm.joined_at
    FROM family_members fm
    WHERE fm.family_plan_id = p_family_plan_id
    ORDER BY fm.role = 'owner' DESC, fm.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending invitations for a family plan
CREATE OR REPLACE FUNCTION get_family_invitations(p_family_plan_id UUID)
RETURNS TABLE (
    invitation_id UUID,
    invitee_email VARCHAR(255),
    invite_code VARCHAR(32),
    status VARCHAR(20),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fi.id as invitation_id,
        fi.invitee_email,
        fi.invite_code,
        fi.status,
        fi.expires_at,
        fi.created_at
    FROM family_invitations fi
    WHERE fi.family_plan_id = p_family_plan_id
    AND fi.status = 'pending'
    AND fi.expires_at > NOW()
    ORDER BY fi.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept a family invitation
CREATE OR REPLACE FUNCTION accept_family_invitation(
    p_invite_code VARCHAR(32),
    p_user_id UUID,
    p_user_email TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    family_plan_id UUID
) AS $$
DECLARE
    v_invitation family_invitations;
    v_member_count INTEGER;
BEGIN
    -- Get the invitation
    SELECT * INTO v_invitation
    FROM family_invitations
    WHERE invite_code = p_invite_code
    AND status = 'pending'
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invalid or expired invitation code'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Check if user is already in a family plan
    IF EXISTS (SELECT 1 FROM family_members WHERE user_id = p_user_id) THEN
        RETURN QUERY SELECT FALSE, 'You are already a member of a family plan'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Check member count
    v_member_count := get_family_member_count(v_invitation.family_plan_id);
    IF v_member_count >= 10 THEN
        RETURN QUERY SELECT FALSE, 'This family plan has reached the maximum of 10 members'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Add user as member
    INSERT INTO family_members (family_plan_id, user_id, email, role)
    VALUES (v_invitation.family_plan_id, p_user_id, p_user_email, 'member');
    
    -- Update invitation status
    UPDATE family_invitations
    SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
    WHERE id = v_invitation.id;
    
    RETURN QUERY SELECT TRUE, 'Successfully joined family plan'::TEXT, v_invitation.family_plan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove a family member
CREATE OR REPLACE FUNCTION remove_family_member(
    p_family_plan_id UUID,
    p_member_id UUID,
    p_requester_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_requester_role VARCHAR(20);
    v_member_role VARCHAR(20);
    v_member_user_id UUID;
BEGIN
    -- Get requester's role
    SELECT role INTO v_requester_role
    FROM family_members
    WHERE family_plan_id = p_family_plan_id AND user_id = p_requester_id;
    
    IF v_requester_role IS NULL THEN
        RETURN QUERY SELECT FALSE, 'You are not a member of this family plan'::TEXT;
        RETURN;
    END IF;
    
    -- Get member's role and user_id
    SELECT role, user_id INTO v_member_role, v_member_user_id
    FROM family_members
    WHERE id = p_member_id AND family_plan_id = p_family_plan_id;
    
    IF v_member_role IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Member not found'::TEXT;
        RETURN;
    END IF;
    
    -- Can't remove the owner
    IF v_member_role = 'owner' THEN
        RETURN QUERY SELECT FALSE, 'Cannot remove the family plan owner'::TEXT;
        RETURN;
    END IF;
    
    -- Only owner or admin can remove members (or member can remove themselves)
    IF v_requester_role NOT IN ('owner', 'admin') AND v_member_user_id != p_requester_id THEN
        RETURN QUERY SELECT FALSE, 'You do not have permission to remove this member'::TEXT;
        RETURN;
    END IF;
    
    -- Remove the member
    DELETE FROM family_members WHERE id = p_member_id;
    
    RETURN QUERY SELECT TRUE, 'Member removed successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke a pending invitation
CREATE OR REPLACE FUNCTION revoke_family_invitation(
    p_invitation_id UUID,
    p_requester_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_invitation family_invitations;
    v_requester_role VARCHAR(20);
BEGIN
    -- Get the invitation
    SELECT * INTO v_invitation
    FROM family_invitations
    WHERE id = p_invitation_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invitation not found or already processed'::TEXT;
        RETURN;
    END IF;
    
    -- Get requester's role
    SELECT role INTO v_requester_role
    FROM family_members
    WHERE family_plan_id = v_invitation.family_plan_id AND user_id = p_requester_id;
    
    -- Only owner or admin can revoke invitations
    IF v_requester_role NOT IN ('owner', 'admin') THEN
        RETURN QUERY SELECT FALSE, 'You do not have permission to revoke this invitation'::TEXT;
        RETURN;
    END IF;
    
    -- Revoke the invitation
    UPDATE family_invitations
    SET status = 'revoked', updated_at = NOW()
    WHERE id = p_invitation_id;
    
    RETURN QUERY SELECT TRUE, 'Invitation revoked successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire old invitations (for scheduled job)
CREATE OR REPLACE FUNCTION expire_old_family_invitations()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE family_invitations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expires_at < NOW();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get the family plan owner for a given user (for content sharing)
CREATE OR REPLACE FUNCTION get_family_owner_id(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    SELECT fp.owner_id INTO v_owner_id
    FROM family_members fm
    JOIN family_plans fp ON fp.id = fm.family_plan_id
    WHERE fm.user_id = p_user_id;
    
    RETURN v_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
