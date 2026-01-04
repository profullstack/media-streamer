-- Fix function_search_path_mutable security warnings
-- This migration sets search_path = '' for all functions to prevent search path manipulation attacks
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- ============================================
-- FAMILY PLAN FUNCTIONS (from 20260102140000_add_family_plans.sql)
-- ============================================

-- 1. create_family_plan_for_user
CREATE OR REPLACE FUNCTION public.create_family_plan_for_user(
    p_user_id UUID,
    p_user_email TEXT,
    p_plan_name TEXT DEFAULT 'My Family'
)
RETURNS public.family_plans AS $$
DECLARE
    v_plan public.family_plans;
BEGIN
    -- Create the family plan
    INSERT INTO public.family_plans (owner_id, plan_name)
    VALUES (p_user_id, p_plan_name)
    ON CONFLICT (owner_id) DO UPDATE SET updated_at = NOW()
    RETURNING * INTO v_plan;
    
    -- Add owner as first member
    INSERT INTO public.family_members (family_plan_id, user_id, email, role)
    VALUES (v_plan.id, p_user_id, p_user_email, 'owner')
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN v_plan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. get_family_member_count
CREATE OR REPLACE FUNCTION public.get_family_member_count(p_family_plan_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM public.family_members 
        WHERE family_plan_id = p_family_plan_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. can_invite_family_member
CREATE OR REPLACE FUNCTION public.can_invite_family_member(p_family_plan_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.get_family_member_count(p_family_plan_id) < 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. get_user_family_plan
CREATE OR REPLACE FUNCTION public.get_user_family_plan(p_user_id UUID)
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
        public.get_family_member_count(fp.id) as member_count,
        fm.role as user_role,
        fp.created_at
    FROM public.family_plans fp
    JOIN public.family_members fm ON fm.family_plan_id = fp.id AND fm.user_id = p_user_id
    JOIN auth.users au ON au.id = fp.owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. get_family_members
CREATE OR REPLACE FUNCTION public.get_family_members(p_family_plan_id UUID)
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
    FROM public.family_members fm
    WHERE fm.family_plan_id = p_family_plan_id
    ORDER BY fm.role = 'owner' DESC, fm.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 6. get_family_invitations
CREATE OR REPLACE FUNCTION public.get_family_invitations(p_family_plan_id UUID)
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
    FROM public.family_invitations fi
    WHERE fi.family_plan_id = p_family_plan_id
    AND fi.status = 'pending'
    AND fi.expires_at > NOW()
    ORDER BY fi.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7. accept_family_invitation
CREATE OR REPLACE FUNCTION public.accept_family_invitation(
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
    v_invitation public.family_invitations;
    v_member_count INTEGER;
BEGIN
    -- Get the invitation
    SELECT * INTO v_invitation
    FROM public.family_invitations
    WHERE invite_code = p_invite_code
    AND status = 'pending'
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invalid or expired invitation code'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Check if user is already in a family plan
    IF EXISTS (SELECT 1 FROM public.family_members WHERE user_id = p_user_id) THEN
        RETURN QUERY SELECT FALSE, 'You are already a member of a family plan'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Check member count
    v_member_count := public.get_family_member_count(v_invitation.family_plan_id);
    IF v_member_count >= 10 THEN
        RETURN QUERY SELECT FALSE, 'This family plan has reached the maximum of 10 members'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Add user as member
    INSERT INTO public.family_members (family_plan_id, user_id, email, role)
    VALUES (v_invitation.family_plan_id, p_user_id, p_user_email, 'member');
    
    -- Update invitation status
    UPDATE public.family_invitations
    SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
    WHERE id = v_invitation.id;
    
    RETURN QUERY SELECT TRUE, 'Successfully joined family plan'::TEXT, v_invitation.family_plan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 8. remove_family_member
CREATE OR REPLACE FUNCTION public.remove_family_member(
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
    FROM public.family_members
    WHERE family_plan_id = p_family_plan_id AND user_id = p_requester_id;
    
    IF v_requester_role IS NULL THEN
        RETURN QUERY SELECT FALSE, 'You are not a member of this family plan'::TEXT;
        RETURN;
    END IF;
    
    -- Get member's role and user_id
    SELECT role, user_id INTO v_member_role, v_member_user_id
    FROM public.family_members
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
    DELETE FROM public.family_members WHERE id = p_member_id;
    
    RETURN QUERY SELECT TRUE, 'Member removed successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 9. revoke_family_invitation
CREATE OR REPLACE FUNCTION public.revoke_family_invitation(
    p_invitation_id UUID,
    p_requester_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_invitation public.family_invitations;
    v_requester_role VARCHAR(20);
BEGIN
    -- Get the invitation
    SELECT * INTO v_invitation
    FROM public.family_invitations
    WHERE id = p_invitation_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invitation not found or already processed'::TEXT;
        RETURN;
    END IF;
    
    -- Get requester's role
    SELECT role INTO v_requester_role
    FROM public.family_members
    WHERE family_plan_id = v_invitation.family_plan_id AND user_id = p_requester_id;
    
    -- Only owner or admin can revoke invitations
    IF v_requester_role NOT IN ('owner', 'admin') THEN
        RETURN QUERY SELECT FALSE, 'You do not have permission to revoke this invitation'::TEXT;
        RETURN;
    END IF;
    
    -- Revoke the invitation
    UPDATE public.family_invitations
    SET status = 'revoked', updated_at = NOW()
    WHERE id = p_invitation_id;
    
    RETURN QUERY SELECT TRUE, 'Invitation revoked successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 10. expire_old_family_invitations
CREATE OR REPLACE FUNCTION public.expire_old_family_invitations()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.family_invitations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expires_at < NOW();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 11. get_family_owner_id
CREATE OR REPLACE FUNCTION public.get_family_owner_id(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    SELECT fp.owner_id INTO v_owner_id
    FROM public.family_members fm
    JOIN public.family_plans fp ON fp.id = fm.family_plan_id
    WHERE fm.user_id = p_user_id;
    
    RETURN v_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================
-- IPTV SUBSCRIPTION FUNCTIONS (from 20260102130000_add_iptv_subscriptions.sql)
-- ============================================

-- 12. update_iptv_subscriptions_updated_at
CREATE OR REPLACE FUNCTION public.update_iptv_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 13. get_active_iptv_subscription
CREATE OR REPLACE FUNCTION public.get_active_iptv_subscription(p_user_id UUID)
RETURNS TABLE (
    subscription_id UUID,
    argontv_line_id INTEGER,
    username VARCHAR(255),
    password VARCHAR(255),
    m3u_download_link TEXT,
    package_key VARCHAR(50),
    status VARCHAR(20),
    expires_at TIMESTAMPTZ,
    days_remaining INTEGER,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS subscription_id,
        s.argontv_line_id,
        s.username,
        s.password,
        s.m3u_download_link,
        s.package_key,
        s.status,
        s.expires_at,
        GREATEST(0, EXTRACT(DAY FROM (s.expires_at - NOW()))::INTEGER) AS days_remaining,
        (s.status = 'active' AND s.expires_at > NOW()) AS is_active
    FROM public.iptv_subscriptions s
    WHERE s.user_id = p_user_id
    ORDER BY s.expires_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission to authenticated users (re-grant after function replacement)
GRANT EXECUTE ON FUNCTION public.get_active_iptv_subscription(UUID) TO authenticated;
