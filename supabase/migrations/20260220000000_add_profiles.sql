-- Netflix-style Profiles Migration
-- Adds support for multiple profiles per account, replacing the 1:1 user_profiles system

-- ============================================
-- PROFILES TABLE
-- ============================================
-- Replaces user_profiles with a 1:many relationship to auth.users
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Links to the master account (auth.users)
    account_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    -- Profile info
    name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 50),
    avatar_url TEXT,
    avatar_emoji TEXT,
    -- First profile auto-created is marked as default
    is_default BOOLEAN DEFAULT false NOT NULL,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Max 5 profiles per account constraint will be enforced via trigger
    -- Unique profile names per account
    UNIQUE(account_id, name)
);

-- Indexes for profiles
CREATE INDEX idx_profiles_account_id ON profiles(account_id);
CREATE INDEX idx_profiles_is_default ON profiles(account_id, is_default);

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CONSTRAINT: MAX 10 PROFILES PER ACCOUNT AND FAMILY TIER CHECK
-- ============================================
CREATE OR REPLACE FUNCTION check_profile_constraints()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    profile_count INTEGER;
    user_subscription_tier TEXT;
BEGIN
    -- Get current profile count for this account
    SELECT COUNT(*) INTO profile_count 
    FROM profiles 
    WHERE account_id = NEW.account_id;
    
    -- Check max profiles limit
    IF profile_count >= 10 THEN
        RAISE EXCEPTION 'Maximum 10 profiles per account allowed';
    END IF;
    
    -- If creating a second or more profile, check subscription tier
    IF profile_count >= 1 THEN
        -- Get user's subscription tier from auth.users (we'll store it in a custom field)
        -- For now, we'll rely on the API-level checks since the subscription data 
        -- might be in a different table/service
        -- This trigger mainly enforces the 5 profile limit
        NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_profile_constraints
    BEFORE INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_profile_constraints();

-- ============================================
-- CONSTRAINT: ONE DEFAULT PROFILE PER ACCOUNT
-- ============================================
CREATE OR REPLACE FUNCTION ensure_single_default_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If setting this profile as default, unset others
    IF NEW.is_default = true THEN
        UPDATE profiles 
        SET is_default = false 
        WHERE account_id = NEW.account_id 
        AND id != COALESCE(NEW.id, gen_random_uuid());
    END IF;
    
    -- Ensure at least one default exists
    IF NEW.is_default = false THEN
        -- Check if this would leave no default profiles
        IF NOT EXISTS (
            SELECT 1 FROM profiles 
            WHERE account_id = NEW.account_id 
            AND is_default = true 
            AND id != COALESCE(NEW.id, gen_random_uuid())
        ) THEN
            -- If this is the only profile, must be default
            IF (SELECT COUNT(*) FROM profiles WHERE account_id = NEW.account_id) <= 1 THEN
                NEW.is_default = true;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_default_profile
    BEFORE INSERT OR UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_profile();

-- ============================================
-- MIGRATE EXISTING USER_PROFILES DATA
-- ============================================
-- Create default profiles for existing users with user_profiles
INSERT INTO profiles (account_id, name, avatar_url, is_default, created_at)
SELECT 
    up.user_id as account_id,
    COALESCE(up.display_name, 'Profile 1') as name,
    up.avatar_url,
    true as is_default,  -- First profile is always default
    up.created_at
FROM user_profiles up
ON CONFLICT DO NOTHING;

-- ============================================
-- ADD PROFILE_ID TO EXISTING TABLES
-- ============================================

-- Add profile_id to torrent_favorites
ALTER TABLE torrent_favorites ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_torrent_favorites_profile_id ON torrent_favorites(profile_id);

-- Add profile_id to iptv_channel_favorites  
ALTER TABLE iptv_channel_favorites ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_iptv_channel_favorites_profile_id ON iptv_channel_favorites(profile_id);

-- Add profile_id to torrent_comments
ALTER TABLE torrent_comments ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_torrent_comments_profile_id ON torrent_comments(profile_id);

-- Add profile_id to comment_votes
ALTER TABLE comment_votes ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_comment_votes_profile_id ON comment_votes(profile_id);

-- Add profile_id to torrent_votes  
ALTER TABLE torrent_votes ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_torrent_votes_profile_id ON torrent_votes(profile_id);

-- Add profile_id to podcast_listen_progress
ALTER TABLE podcast_listen_progress ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_podcast_listen_progress_profile_id ON podcast_listen_progress(profile_id);

-- Add profile_id to radio_station_favorites  
ALTER TABLE radio_station_favorites ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_radio_station_favorites_profile_id ON radio_station_favorites(profile_id);

-- Add profile_id to watchlists
ALTER TABLE watchlists ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_watchlists_profile_id ON watchlists(profile_id);

-- Check if library_history table exists and add profile_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'library_history') THEN
        ALTER TABLE library_history ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
        CREATE INDEX idx_library_history_profile_id ON library_history(profile_id);
    END IF;
END $$;

-- Check if watch_progress table exists and add profile_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'watch_progress') THEN
        ALTER TABLE watch_progress ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
        CREATE INDEX idx_watch_progress_profile_id ON watch_progress(profile_id);
    END IF;
END $$;

-- Check if reading_progress table exists and add profile_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reading_progress') THEN
        ALTER TABLE reading_progress ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
        CREATE INDEX idx_reading_progress_profile_id ON reading_progress(profile_id);
    END IF;
END $$;

-- ============================================
-- MIGRATE DATA TO DEFAULT PROFILES
-- ============================================
-- Update torrent_favorites to use default profile for each user
UPDATE torrent_favorites tf
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = tf.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE tf.profile_id IS NULL;

-- Update iptv_channel_favorites to use default profile for each user
UPDATE iptv_channel_favorites icf
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = icf.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE icf.profile_id IS NULL;

-- Update torrent_comments to use default profile for each user
UPDATE torrent_comments tc
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = tc.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE tc.profile_id IS NULL;

-- Update comment_votes to use default profile for each user
UPDATE comment_votes cv
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = cv.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE cv.profile_id IS NULL;

-- Update torrent_votes to use default profile for each user
UPDATE torrent_votes tv
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = tv.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE tv.profile_id IS NULL;

-- Update podcast_listen_progress to use default profile for each user
UPDATE podcast_listen_progress plp
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = plp.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE plp.profile_id IS NULL;

-- Update radio_station_favorites to use default profile for each user  
UPDATE radio_station_favorites rsf
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = rsf.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE rsf.profile_id IS NULL;

-- Update watchlists to use default profile for each user
UPDATE watchlists w
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = w.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE w.profile_id IS NULL;

-- Update library_history if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'library_history') THEN
        EXECUTE '
        UPDATE library_history lh
        SET profile_id = (
            SELECT p.id FROM profiles p 
            WHERE p.account_id = lh.user_id 
            AND p.is_default = true 
            LIMIT 1
        )
        WHERE lh.profile_id IS NULL';
    END IF;
END $$;

-- Update watch_progress if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'watch_progress') THEN
        EXECUTE '
        UPDATE watch_progress wp
        SET profile_id = (
            SELECT p.id FROM profiles p 
            WHERE p.account_id = wp.user_id 
            AND p.is_default = true 
            LIMIT 1
        )
        WHERE wp.profile_id IS NULL';
    END IF;
END $$;

-- Update reading_progress if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reading_progress') THEN
        EXECUTE '
        UPDATE reading_progress rp
        SET profile_id = (
            SELECT p.id FROM profiles p 
            WHERE p.account_id = rp.user_id 
            AND p.is_default = true 
            LIMIT 1
        )
        WHERE rp.profile_id IS NULL';
    END IF;
END $$;

-- ============================================
-- UPDATE UNIQUE CONSTRAINTS TO USE PROFILE_ID
-- ============================================

-- Drop old unique constraints
ALTER TABLE torrent_favorites DROP CONSTRAINT torrent_favorites_user_id_torrent_id_key;
ALTER TABLE iptv_channel_favorites DROP CONSTRAINT iptv_channel_favorites_user_id_playlist_id_channel_id_key;

-- Add new unique constraints with profile_id
ALTER TABLE torrent_favorites ADD CONSTRAINT unique_profile_torrent_favorite UNIQUE(profile_id, torrent_id);
ALTER TABLE iptv_channel_favorites ADD CONSTRAINT unique_profile_iptv_channel_favorite UNIQUE(profile_id, playlist_id, channel_id);

-- Update other unique constraints
ALTER TABLE comment_votes DROP CONSTRAINT IF EXISTS comment_votes_user_id_comment_id_key;
ALTER TABLE comment_votes ADD CONSTRAINT unique_profile_comment_vote UNIQUE(profile_id, comment_id);

ALTER TABLE torrent_votes DROP CONSTRAINT IF EXISTS torrent_votes_user_id_torrent_id_key;
ALTER TABLE torrent_votes ADD CONSTRAINT unique_profile_torrent_vote UNIQUE(profile_id, torrent_id);

-- Podcast progress should be unique per profile
ALTER TABLE podcast_listen_progress DROP CONSTRAINT IF EXISTS podcast_listen_progress_user_id_episode_id_key;
ALTER TABLE podcast_listen_progress ADD CONSTRAINT unique_profile_podcast_progress UNIQUE(profile_id, episode_id);

-- Radio favorites should be unique per profile
ALTER TABLE radio_station_favorites DROP CONSTRAINT IF EXISTS radio_station_favorites_user_id_station_id_key;
ALTER TABLE radio_station_favorites ADD CONSTRAINT unique_profile_radio_favorite UNIQUE(profile_id, station_id);

-- Watchlists are unique per profile by name
ALTER TABLE watchlists DROP CONSTRAINT IF EXISTS watchlists_user_id_name_key;
ALTER TABLE watchlists ADD CONSTRAINT unique_profile_watchlist_name UNIQUE(profile_id, name);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profiles
CREATE POLICY "Users can view their own profiles"
    ON profiles FOR SELECT
    USING (auth.uid() = account_id);

-- Users can insert their own profiles (max 5 enforced by trigger)
CREATE POLICY "Users can insert their own profiles"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = account_id);

-- Users can update their own profiles
CREATE POLICY "Users can update their own profiles"
    ON profiles FOR UPDATE
    USING (auth.uid() = account_id);

-- Users can delete their own profiles (but not if it's the last one)
CREATE POLICY "Users can delete their own profiles"
    ON profiles FOR DELETE
    USING (
        auth.uid() = account_id 
        AND NOT is_default  -- Cannot delete default profile
        AND (SELECT COUNT(*) FROM profiles WHERE account_id = auth.uid()) > 1  -- Must have > 1 profile
    );

-- Service role can manage all profiles
CREATE POLICY "Service role can manage profiles"
    ON profiles FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

-- Get profiles for an account
CREATE OR REPLACE FUNCTION get_account_profiles(target_account_id UUID)
RETURNS TABLE (
    profile_id UUID,
    profile_account_id UUID,
    profile_name TEXT,
    profile_avatar_url TEXT,
    profile_avatar_emoji TEXT,
    profile_is_default BOOLEAN,
    profile_created_at TIMESTAMPTZ,
    profile_updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS profile_id,
        p.account_id AS profile_account_id,
        p.name AS profile_name,
        p.avatar_url AS profile_avatar_url,
        p.avatar_emoji AS profile_avatar_emoji,
        p.is_default AS profile_is_default,
        p.created_at AS profile_created_at,
        p.updated_at AS profile_updated_at
    FROM profiles p
    WHERE p.account_id = target_account_id
    ORDER BY p.is_default DESC, p.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Get default profile for an account
CREATE OR REPLACE FUNCTION get_default_profile(target_account_id UUID)
RETURNS TABLE (
    profile_id UUID,
    profile_account_id UUID,
    profile_name TEXT,
    profile_avatar_url TEXT,
    profile_avatar_emoji TEXT,
    profile_is_default BOOLEAN,
    profile_created_at TIMESTAMPTZ,
    profile_updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS profile_id,
        p.account_id AS profile_account_id,
        p.name AS profile_name,
        p.avatar_url AS profile_avatar_url,
        p.avatar_emoji AS profile_avatar_emoji,
        p.is_default AS profile_is_default,
        p.created_at AS profile_created_at,
        p.updated_at AS profile_updated_at
    FROM profiles p
    WHERE p.account_id = target_account_id
    AND p.is_default = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================
GRANT EXECUTE ON FUNCTION get_account_profiles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_default_profile(UUID) TO authenticated;