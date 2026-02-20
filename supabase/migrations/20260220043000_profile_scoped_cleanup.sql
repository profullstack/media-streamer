-- Profile-scoped cleanup migration
-- 1. Add profile_id to podcast_subscriptions
-- 2. Drop user_id NOT NULL on all profile-scoped tables
-- 3. Create profile-based RPC for podcast subscriptions
-- 4. Update unique constraints

-- ============================================
-- PODCAST SUBSCRIPTIONS: ADD profile_id
-- ============================================

ALTER TABLE podcast_subscriptions ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_podcast_subscriptions_profile_id ON podcast_subscriptions(profile_id);

-- Backfill existing rows with default profile
UPDATE podcast_subscriptions ps
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = ps.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE profile_id IS NULL AND user_id IS NOT NULL;

-- Update unique constraint from user-based to profile-based
ALTER TABLE podcast_subscriptions DROP CONSTRAINT IF EXISTS podcast_subscriptions_user_id_podcast_id_key;
ALTER TABLE podcast_subscriptions ADD CONSTRAINT unique_profile_podcast_subscription UNIQUE(profile_id, podcast_id);

-- ============================================
-- DROP user_id NOT NULL ON PROFILE-SCOPED TABLES
-- ============================================
-- These tables now use profile_id as the primary scope.
-- user_id is kept for backward compat / audit trail but is no longer required.

ALTER TABLE podcast_subscriptions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE podcast_listen_progress ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE iptv_channel_favorites ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bt_torrent_favorites ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bt_torrent_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bt_torrent_votes ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE user_favorites ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE collections ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE user_watchlists ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE radio_station_favorites ALTER COLUMN user_id DROP NOT NULL;

-- ============================================
-- UPDATE listen progress unique constraint
-- ============================================

ALTER TABLE podcast_listen_progress DROP CONSTRAINT IF EXISTS podcast_listen_progress_user_id_episode_id_key;
ALTER TABLE podcast_listen_progress DROP CONSTRAINT IF EXISTS unique_profile_podcast_progress;
ALTER TABLE podcast_listen_progress ADD CONSTRAINT unique_profile_podcast_progress UNIQUE(profile_id, episode_id);

-- ============================================
-- PROFILE-BASED PODCAST SUBSCRIPTIONS RPC
-- ============================================

CREATE OR REPLACE FUNCTION get_profile_podcast_subscriptions(p_profile_id uuid)
RETURNS TABLE(
    subscription_id uuid,
    podcast_id uuid,
    podcast_title text,
    podcast_author text,
    podcast_description text,
    podcast_image_url text,
    podcast_feed_url text,
    podcast_website_url text,
    notify_new_episodes boolean,
    latest_episode_title text,
    latest_episode_published_at timestamp with time zone,
    unlistened_count bigint,
    subscribed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps.id AS subscription_id,
        p.id AS podcast_id,
        p.title AS podcast_title,
        p.author AS podcast_author,
        p.description AS podcast_description,
        p.image_url AS podcast_image_url,
        p.feed_url AS podcast_feed_url,
        p.website_url AS podcast_website_url,
        ps.notify_new_episodes,
        latest_ep.title AS latest_episode_title,
        latest_ep.published_at AS latest_episode_published_at,
        COALESCE(unlistened.count, 0) AS unlistened_count,
        ps.created_at AS subscribed_at
    FROM podcast_subscriptions ps
    JOIN podcasts p ON ps.podcast_id = p.id
    LEFT JOIN LATERAL (
        SELECT pe.title, pe.published_at
        FROM podcast_episodes pe
        WHERE pe.podcast_id = p.id
        ORDER BY pe.published_at DESC
        LIMIT 1
    ) latest_ep ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM podcast_episodes pe
        WHERE pe.podcast_id = p.id
        AND NOT EXISTS (
            SELECT 1 FROM podcast_listen_progress plp
            WHERE plp.episode_id = pe.id
            AND plp.profile_id = p_profile_id
            AND plp.completed = true
        )
    ) unlistened ON true
    WHERE ps.profile_id = p_profile_id
    ORDER BY latest_ep.published_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_profile_podcast_subscriptions TO anon, authenticated, service_role;
