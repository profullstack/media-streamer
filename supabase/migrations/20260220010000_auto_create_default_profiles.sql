-- Auto-create default profiles for all users
-- Fixes: existing users without user_profiles rows, and new signups

-- ============================================
-- 1. BACKFILL: Create default profile for ALL existing users who don't have one
-- ============================================
INSERT INTO profiles (account_id, name, is_default, created_at)
SELECT 
    u.id as account_id,
    'Profile 1' as name,
    true as is_default,
    COALESCE(u.created_at, NOW()) as created_at
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.account_id = u.id
)
ON CONFLICT DO NOTHING;

-- ============================================
-- 2. BACKFILL: Set profile_id on existing rows that still have NULL
-- ============================================
-- For each table with profile_id, set it to the user's default profile
UPDATE torrent_favorites tf
SET profile_id = p.id
FROM profiles p
WHERE p.account_id = tf.user_id
AND p.is_default = true
AND tf.profile_id IS NULL;

UPDATE iptv_channel_favorites icf
SET profile_id = p.id
FROM profiles p
WHERE p.account_id = icf.user_id
AND p.is_default = true
AND icf.profile_id IS NULL;

UPDATE torrent_comments tc
SET profile_id = p.id
FROM profiles p
WHERE p.account_id = tc.user_id
AND p.is_default = true
AND tc.profile_id IS NULL;

UPDATE comment_votes cv
SET profile_id = p.id
FROM profiles p
WHERE p.account_id = cv.user_id
AND p.is_default = true
AND cv.profile_id IS NULL;

UPDATE torrent_votes tv
SET profile_id = p.id
FROM profiles p
WHERE p.account_id = tv.user_id
AND p.is_default = true
AND tv.profile_id IS NULL;

-- Watchlists (user_watchlists table)
UPDATE user_watchlists w
SET profile_id = p.id
FROM profiles p
WHERE p.account_id = w.user_id
AND p.is_default = true
AND w.profile_id IS NULL;

-- Only update tables that have both user_id and profile_id columns
-- podcast_listen_progress, radio_station_favorites may or may not exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'podcast_listen_progress' AND column_name = 'profile_id') THEN
        EXECUTE '
            UPDATE podcast_listen_progress plp
            SET profile_id = p.id
            FROM profiles p
            WHERE p.account_id = plp.user_id
            AND p.is_default = true
            AND plp.profile_id IS NULL';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'radio_station_favorites' AND column_name = 'profile_id') THEN
        EXECUTE '
            UPDATE radio_station_favorites rsf
            SET profile_id = p.id
            FROM profiles p
            WHERE p.account_id = rsf.user_id
            AND p.is_default = true
            AND rsf.profile_id IS NULL';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_history' AND column_name = 'profile_id') THEN
        EXECUTE '
            UPDATE library_history lh
            SET profile_id = p.id
            FROM profiles p
            WHERE p.account_id = lh.user_id
            AND p.is_default = true
            AND lh.profile_id IS NULL';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'watch_progress' AND column_name = 'profile_id') THEN
        EXECUTE '
            UPDATE watch_progress wp
            SET profile_id = p.id
            FROM profiles p
            WHERE p.account_id = wp.user_id
            AND p.is_default = true
            AND wp.profile_id IS NULL';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reading_progress' AND column_name = 'profile_id') THEN
        EXECUTE '
            UPDATE reading_progress rp
            SET profile_id = p.id
            FROM profiles p
            WHERE p.account_id = rp.user_id
            AND p.is_default = true
            AND rp.profile_id IS NULL';
    END IF;
END $$;

-- ============================================
-- 3. TRIGGER: Auto-create default profile on new user signup
-- ============================================
CREATE OR REPLACE FUNCTION create_default_profile_on_signup()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO profiles (account_id, name, is_default)
    VALUES (NEW.id, 'Profile 1', true)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trigger_create_default_profile ON auth.users;

CREATE TRIGGER trigger_create_default_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_profile_on_signup();
