-- Podcast Platform - Podcast Subscriptions and Web Push Notifications
-- This migration creates tables for podcast subscriptions and push notifications

-- ============================================
-- PODCASTS TABLE
-- Stores podcast metadata from search results
-- ============================================
CREATE TABLE podcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- External identifiers
    feed_url TEXT UNIQUE NOT NULL,
    -- Metadata
    title TEXT NOT NULL,
    description TEXT,
    author TEXT,
    image_url TEXT,
    website_url TEXT,
    language VARCHAR(10),
    categories TEXT[],
    -- Episode tracking
    last_episode_date TIMESTAMPTZ,
    episode_count INTEGER DEFAULT 0,
    -- Full-text search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for podcasts
CREATE INDEX idx_podcasts_feed_url ON podcasts(feed_url);
CREATE INDEX idx_podcasts_search ON podcasts USING GIN(search_vector);
CREATE INDEX idx_podcasts_title ON podcasts(title);
CREATE INDEX idx_podcasts_last_episode ON podcasts(last_episode_date DESC);

-- ============================================
-- PODCAST SUBSCRIPTIONS TABLE
-- User subscriptions to podcasts
-- ============================================
CREATE TABLE podcast_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    podcast_id UUID REFERENCES podcasts(id) ON DELETE CASCADE NOT NULL,
    -- Notification preferences
    notify_new_episodes BOOLEAN DEFAULT true,
    -- Tracking
    last_listened_episode_id UUID,
    last_listened_at TIMESTAMPTZ,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, podcast_id)
);

-- Indexes for podcast_subscriptions
CREATE INDEX idx_podcast_subscriptions_user_id ON podcast_subscriptions(user_id);
CREATE INDEX idx_podcast_subscriptions_podcast_id ON podcast_subscriptions(podcast_id);
CREATE INDEX idx_podcast_subscriptions_notify ON podcast_subscriptions(notify_new_episodes) WHERE notify_new_episodes = true;

-- ============================================
-- PODCAST EPISODES TABLE
-- Cache of episodes for subscribed podcasts
-- ============================================
CREATE TABLE podcast_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    podcast_id UUID REFERENCES podcasts(id) ON DELETE CASCADE NOT NULL,
    -- Episode identifiers
    guid TEXT NOT NULL,
    -- Metadata
    title TEXT NOT NULL,
    description TEXT,
    audio_url TEXT NOT NULL,
    duration_seconds INTEGER,
    image_url TEXT,
    -- Publication info
    published_at TIMESTAMPTZ NOT NULL,
    season_number INTEGER,
    episode_number INTEGER,
    -- Full-text search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(podcast_id, guid)
);

-- Indexes for podcast_episodes
CREATE INDEX idx_podcast_episodes_podcast_id ON podcast_episodes(podcast_id);
CREATE INDEX idx_podcast_episodes_published ON podcast_episodes(published_at DESC);
CREATE INDEX idx_podcast_episodes_search ON podcast_episodes USING GIN(search_vector);
CREATE INDEX idx_podcast_episodes_guid ON podcast_episodes(guid);

-- ============================================
-- PODCAST LISTEN PROGRESS TABLE
-- Track user listening progress per episode
-- ============================================
CREATE TABLE podcast_listen_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    episode_id UUID REFERENCES podcast_episodes(id) ON DELETE CASCADE NOT NULL,
    -- Progress tracking
    current_time_seconds INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    percentage DECIMAL(5,2) DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    -- Timestamps
    last_listened_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, episode_id)
);

-- Indexes for podcast_listen_progress
CREATE INDEX idx_podcast_listen_progress_user_id ON podcast_listen_progress(user_id);
CREATE INDEX idx_podcast_listen_progress_episode_id ON podcast_listen_progress(episode_id);
CREATE INDEX idx_podcast_listen_progress_last_listened ON podcast_listen_progress(last_listened_at DESC);

-- ============================================
-- PUSH SUBSCRIPTIONS TABLE
-- Web Push notification subscriptions
-- ============================================
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    -- Push subscription data (from browser)
    endpoint TEXT UNIQUE NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    -- Device info
    user_agent TEXT,
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for push_subscriptions
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;

-- ============================================
-- NOTIFICATION HISTORY TABLE
-- Track sent notifications
-- ============================================
CREATE TABLE notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    push_subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL,
    -- Notification content
    notification_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB,
    -- Delivery status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'clicked')),
    error_message TEXT,
    -- Related entities
    podcast_id UUID REFERENCES podcasts(id) ON DELETE SET NULL,
    episode_id UUID REFERENCES podcast_episodes(id) ON DELETE SET NULL,
    -- Timestamps
    sent_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for notification_history
CREATE INDEX idx_notification_history_user_id ON notification_history(user_id);
CREATE INDEX idx_notification_history_status ON notification_history(status);
CREATE INDEX idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX idx_notification_history_created ON notification_history(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger for podcasts updated_at
CREATE TRIGGER update_podcasts_updated_at
    BEFORE UPDATE ON podcasts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for podcast_subscriptions updated_at
CREATE TRIGGER update_podcast_subscriptions_updated_at
    BEFORE UPDATE ON podcast_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for push_subscriptions updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to search podcasts
CREATE OR REPLACE FUNCTION search_podcasts(
    search_query TEXT,
    result_limit INTEGER DEFAULT 20,
    result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    podcast_id UUID,
    podcast_title TEXT,
    podcast_author TEXT,
    podcast_description TEXT,
    podcast_image_url TEXT,
    podcast_feed_url TEXT,
    podcast_episode_count INTEGER,
    rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS podcast_id,
        p.title AS podcast_title,
        p.author AS podcast_author,
        p.description AS podcast_description,
        p.image_url AS podcast_image_url,
        p.feed_url AS podcast_feed_url,
        p.episode_count AS podcast_episode_count,
        ts_rank(p.search_vector, websearch_to_tsquery('english', search_query)) AS rank
    FROM podcasts p
    WHERE p.search_vector @@ websearch_to_tsquery('english', search_query)
    ORDER BY rank DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;

-- Function to get user's subscribed podcasts with latest episode info
CREATE OR REPLACE FUNCTION get_user_podcast_subscriptions(
    p_user_id UUID
)
RETURNS TABLE (
    subscription_id UUID,
    podcast_id UUID,
    podcast_title TEXT,
    podcast_author TEXT,
    podcast_image_url TEXT,
    podcast_feed_url TEXT,
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
        p.image_url AS podcast_image_url,
        p.feed_url AS podcast_feed_url,
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

-- Function to get users to notify about new episode
CREATE OR REPLACE FUNCTION get_users_to_notify_new_episode(
    p_podcast_id UUID,
    p_episode_id UUID
)
RETURNS TABLE (
    user_id UUID,
    push_endpoint TEXT,
    p256dh_key TEXT,
    auth_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        ps.user_id,
        push.endpoint AS push_endpoint,
        push.p256dh_key,
        push.auth_key
    FROM podcast_subscriptions ps
    JOIN push_subscriptions push ON push.user_id = ps.user_id
    WHERE ps.podcast_id = p_podcast_id
    AND ps.notify_new_episodes = true
    AND push.is_active = true
    -- Don't notify if already notified for this episode
    AND NOT EXISTS (
        SELECT 1 FROM notification_history nh
        WHERE nh.user_id = ps.user_id
        AND nh.episode_id = p_episode_id
        AND nh.status IN ('sent', 'clicked')
    );
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_listen_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

-- Podcasts are publicly readable
CREATE POLICY "Podcasts are publicly readable"
    ON podcasts FOR SELECT
    USING (true);

-- Service role can manage podcasts
CREATE POLICY "Service role can manage podcasts"
    ON podcasts FOR ALL
    USING (auth.role() = 'service_role');

-- Podcast episodes are publicly readable
CREATE POLICY "Podcast episodes are publicly readable"
    ON podcast_episodes FOR SELECT
    USING (true);

-- Service role can manage podcast episodes
CREATE POLICY "Service role can manage podcast episodes"
    ON podcast_episodes FOR ALL
    USING (auth.role() = 'service_role');

-- Users can view their own subscriptions
CREATE POLICY "Users can view their own podcast subscriptions"
    ON podcast_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert their own podcast subscriptions"
    ON podcast_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update their own podcast subscriptions"
    ON podcast_subscriptions FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete their own podcast subscriptions"
    ON podcast_subscriptions FOR DELETE
    USING (auth.uid() = user_id);

-- Users can view their own listen progress
CREATE POLICY "Users can view their own listen progress"
    ON podcast_listen_progress FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own listen progress
CREATE POLICY "Users can insert their own listen progress"
    ON podcast_listen_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own listen progress
CREATE POLICY "Users can update their own listen progress"
    ON podcast_listen_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can view their own push subscriptions
CREATE POLICY "Users can view their own push subscriptions"
    ON push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own push subscriptions
CREATE POLICY "Users can insert their own push subscriptions"
    ON push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own push subscriptions
CREATE POLICY "Users can update their own push subscriptions"
    ON push_subscriptions FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own push subscriptions
CREATE POLICY "Users can delete their own push subscriptions"
    ON push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);

-- Users can view their own notification history
CREATE POLICY "Users can view their own notification history"
    ON notification_history FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage notification history
CREATE POLICY "Service role can manage notification history"
    ON notification_history FOR ALL
    USING (auth.role() = 'service_role');
