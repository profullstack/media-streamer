-- User Profiles Migration
-- Adds user profiles with unique usernames for public display

-- ============================================
-- USER PROFILES TABLE
-- ============================================
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    username VARCHAR(30) UNIQUE NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    -- Public profile settings
    is_public BOOLEAN DEFAULT true NOT NULL,
    -- Stats (denormalized for performance)
    comment_count INTEGER DEFAULT 0 NOT NULL,
    favorite_count INTEGER DEFAULT 0 NOT NULL,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Username constraints
    CONSTRAINT username_format CHECK (
        username ~ '^[a-zA-Z][a-zA-Z0-9_-]{2,29}$'
    ),
    CONSTRAINT username_not_reserved CHECK (
        lower(username) NOT IN (
            'admin', 'administrator', 'root', 'system', 'support',
            'help', 'info', 'contact', 'api', 'www', 'mail',
            'ftp', 'localhost', 'null', 'undefined', 'anonymous',
            'user', 'users', 'profile', 'profiles', 'settings',
            'account', 'accounts', 'login', 'logout', 'signup',
            'register', 'auth', 'oauth', 'callback', 'webhook',
            'static', 'assets', 'public', 'private', 'internal'
        )
    )
);

-- Indexes for user_profiles
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_username ON user_profiles(username);
CREATE INDEX idx_user_profiles_username_lower ON user_profiles(lower(username));

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION TO CHECK USERNAME AVAILABILITY
-- ============================================
CREATE OR REPLACE FUNCTION check_username_available(check_username VARCHAR(30))
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE lower(username) = lower(check_username)
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION TO GET USER BY USERNAME
-- ============================================
CREATE OR REPLACE FUNCTION get_user_by_username(lookup_username VARCHAR(30))
RETURNS TABLE (
    profile_id UUID,
    profile_user_id UUID,
    profile_username VARCHAR(30),
    profile_display_name TEXT,
    profile_bio TEXT,
    profile_avatar_url TEXT,
    profile_is_public BOOLEAN,
    profile_comment_count INTEGER,
    profile_favorite_count INTEGER,
    profile_created_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id AS profile_id,
        up.user_id AS profile_user_id,
        up.username AS profile_username,
        up.display_name AS profile_display_name,
        up.bio AS profile_bio,
        up.avatar_url AS profile_avatar_url,
        up.is_public AS profile_is_public,
        up.comment_count AS profile_comment_count,
        up.favorite_count AS profile_favorite_count,
        up.created_at AS profile_created_at
    FROM user_profiles up
    WHERE lower(up.username) = lower(lookup_username)
    AND up.is_public = true;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS TO UPDATE PROFILE STATS
-- ============================================

-- Function to update comment count
CREATE OR REPLACE FUNCTION update_profile_comment_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE user_profiles
        SET comment_count = comment_count + 1
        WHERE user_id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE user_profiles
        SET comment_count = GREATEST(0, comment_count - 1)
        WHERE user_id = OLD.user_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for comment count
CREATE TRIGGER trigger_update_profile_comment_count
    AFTER INSERT OR DELETE ON torrent_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_comment_count();

-- Function to update favorite count (for torrent favorites)
CREATE OR REPLACE FUNCTION update_profile_favorite_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE user_profiles
        SET favorite_count = favorite_count + 1
        WHERE user_id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE user_profiles
        SET favorite_count = GREATEST(0, favorite_count - 1)
        WHERE user_id = OLD.user_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for favorite count (torrent favorites)
CREATE TRIGGER trigger_update_profile_favorite_count_torrents
    AFTER INSERT OR DELETE ON torrent_favorites
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_favorite_count();

-- Trigger for favorite count (IPTV channel favorites)
CREATE TRIGGER trigger_update_profile_favorite_count_iptv
    AFTER INSERT OR DELETE ON iptv_channel_favorites
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_favorite_count();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Public profiles are readable by everyone
CREATE POLICY "Public profiles are readable"
    ON user_profiles FOR SELECT
    USING (is_public = true OR auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own profile
CREATE POLICY "Users can delete their own profile"
    ON user_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all profiles
CREATE POLICY "Service role can manage profiles"
    ON user_profiles FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================
GRANT EXECUTE ON FUNCTION check_username_available(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION check_username_available(VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION get_user_by_username(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_by_username(VARCHAR) TO anon;
