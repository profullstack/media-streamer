-- Update get_user_podcast_subscriptions to include description and website_url
-- This fixes the missing metadata in the podcast list UI

-- Drop the existing function first since we're changing the return type
DROP FUNCTION IF EXISTS get_user_podcast_subscriptions(UUID);

CREATE OR REPLACE FUNCTION get_user_podcast_subscriptions(
    p_user_id UUID
)
RETURNS TABLE (
    subscription_id UUID,
    podcast_id UUID,
    podcast_title TEXT,
    podcast_author TEXT,
    podcast_description TEXT,
    podcast_image_url TEXT,
    podcast_feed_url TEXT,
    podcast_website_url TEXT,
    notify_new_episodes BOOLEAN,
    latest_episode_title TEXT,
    latest_episode_published_at TIMESTAMPTZ,
    unlistened_count BIGINT,
    subscribed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
            AND plp.user_id = p_user_id
            AND plp.completed = true
        )
    ) unlistened ON true
    WHERE ps.user_id = p_user_id
    ORDER BY latest_ep.published_at DESC NULLS LAST;
END;
$$;
