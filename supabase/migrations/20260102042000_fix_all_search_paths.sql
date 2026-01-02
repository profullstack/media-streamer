-- Migration: Fix ALL function search_path issues
-- This migration drops ALL versions of the problematic functions and recreates them
-- with SET search_path = '' for security

-- ============================================================================
-- Drop ALL existing versions of the functions (all possible signatures)
-- ============================================================================

-- Drop search_files (all possible signatures)
DROP FUNCTION IF EXISTS public.search_files(TEXT);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING(20));
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING(20), INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING(20), INTEGER, INTEGER);

-- Drop activate_subscription (all possible signatures)
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, CHARACTER VARYING, UUID);
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, CHARACTER VARYING, INTEGER);
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, CHARACTER VARYING(20), UUID);
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, CHARACTER VARYING(20), INTEGER);

-- Drop mark_renewal_reminder_sent (all possible signatures)
DROP FUNCTION IF EXISTS public.mark_renewal_reminder_sent(UUID);
DROP FUNCTION IF EXISTS public.mark_renewal_reminder_sent(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.mark_renewal_reminder_sent(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.mark_renewal_reminder_sent(UUID, TIMESTAMP WITH TIME ZONE);

-- Drop get_subscription_status (all possible signatures)
DROP FUNCTION IF EXISTS public.get_subscription_status(UUID);

-- Drop get_subscriptions_needing_reminders (all possible signatures)
DROP FUNCTION IF EXISTS public.get_subscriptions_needing_reminders(INTEGER);

-- Drop trigger first, then create_trial_subscription
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
DROP FUNCTION IF EXISTS public.create_trial_subscription();

-- Drop search functions (all possible signatures)
DROP FUNCTION IF EXISTS public.search_torrents(TEXT);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, CHARACTER VARYING, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, CHARACTER VARYING, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, CHARACTER VARYING(20));
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, CHARACTER VARYING(20), INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, CHARACTER VARYING(20), INTEGER, INTEGER);

DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING(20));
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING(20), INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING(20), INTEGER, INTEGER);

DROP FUNCTION IF EXISTS public.search_all(TEXT);
DROP FUNCTION IF EXISTS public.search_all(TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.search_all(TEXT, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING(20));
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING(20), INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING(20), INTEGER, INTEGER);

DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, VARCHAR, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, VARCHAR, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING, UUID);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING(20));
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING(20), UUID);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING(20), UUID, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, CHARACTER VARYING(20), UUID, INTEGER, INTEGER);

-- ============================================================================
-- Recreate ALL functions with SET search_path = ''
-- ============================================================================

-- update_torrent_folders_updated_at
CREATE OR REPLACE FUNCTION public.update_torrent_folders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- search_files
CREATE FUNCTION public.search_files(
    search_query TEXT,
    p_media_type VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    file_id UUID,
    file_path TEXT,
    file_name TEXT,
    file_size BIGINT,
    file_extension VARCHAR(20),
    file_media_type VARCHAR(20),
    file_mime_type VARCHAR(100),
    file_index INTEGER,
    piece_start INTEGER,
    piece_end INTEGER,
    torrent_id UUID,
    torrent_name TEXT,
    torrent_infohash VARCHAR(40),
    rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tf.id AS file_id,
    tf.path AS file_path,
    tf.name AS file_name,
    tf.size AS file_size,
    tf.extension AS file_extension,
    tf.media_type AS file_media_type,
    tf.mime_type AS file_mime_type,
    tf.file_index,
    tf.piece_start,
    tf.piece_end,
    t.id AS torrent_id,
    t.name AS torrent_name,
    t.infohash AS torrent_infohash,
    ts_rank(to_tsvector('english', tf.path || ' ' || tf.name), plainto_tsquery('english', search_query)) AS rank
  FROM public.torrent_files tf
  JOIN public.torrents t ON tf.torrent_id = t.id
  WHERE
    t.status = 'ready'
    AND (search_query IS NULL OR search_query = '' OR
         to_tsvector('english', tf.path || ' ' || tf.name) @@ plainto_tsquery('english', search_query))
    AND (p_media_type IS NULL OR tf.media_type = p_media_type)
  ORDER BY rank DESC, tf.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- search_torrent_files
CREATE FUNCTION public.search_torrent_files(
  search_query TEXT,
  p_media_type VARCHAR(20) DEFAULT NULL,
  p_torrent_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  file_id UUID,
  file_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  file_extension VARCHAR(20),
  file_media_type VARCHAR(20),
  file_mime_type VARCHAR(100),
  file_index INTEGER,
  piece_start INTEGER,
  piece_end INTEGER,
  torrent_id UUID,
  torrent_name TEXT,
  torrent_infohash VARCHAR(40),
  rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tf.id AS file_id,
    tf.path AS file_path,
    tf.name AS file_name,
    tf.size AS file_size,
    tf.extension AS file_extension,
    tf.media_type AS file_media_type,
    tf.mime_type AS file_mime_type,
    tf.file_index,
    tf.piece_start,
    tf.piece_end,
    t.id AS torrent_id,
    t.name AS torrent_name,
    t.infohash AS torrent_infohash,
    ts_rank(to_tsvector('english', tf.path || ' ' || tf.name), plainto_tsquery('english', search_query)) AS rank
  FROM public.torrent_files tf
  JOIN public.torrents t ON tf.torrent_id = t.id
  WHERE
    t.status = 'ready'
    AND (search_query IS NULL OR search_query = '' OR
         to_tsvector('english', tf.path || ' ' || tf.name) @@ plainto_tsquery('english', search_query))
    AND (p_media_type IS NULL OR tf.media_type = p_media_type)
    AND (p_torrent_id IS NULL OR tf.torrent_id = p_torrent_id)
  ORDER BY rank DESC, tf.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- search_torrents
CREATE FUNCTION public.search_torrents(
  search_query TEXT,
  p_status VARCHAR(20) DEFAULT 'ready',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  torrent_id UUID,
  torrent_name TEXT,
  torrent_infohash VARCHAR(40),
  torrent_size BIGINT,
  torrent_file_count INTEGER,
  torrent_status VARCHAR(20),
  torrent_created_at TIMESTAMPTZ,
  rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS torrent_id,
    t.name AS torrent_name,
    t.infohash AS torrent_infohash,
    t.total_size AS torrent_size,
    t.file_count AS torrent_file_count,
    t.status AS torrent_status,
    t.created_at AS torrent_created_at,
    ts_rank(to_tsvector('english', t.name), plainto_tsquery('english', search_query)) AS rank
  FROM public.torrents t
  WHERE
    (p_status IS NULL OR t.status = p_status)
    AND (search_query IS NULL OR search_query = '' OR
         to_tsvector('english', t.name) @@ plainto_tsquery('english', search_query))
  ORDER BY rank DESC, t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- search_torrents_by_name
CREATE FUNCTION public.search_torrents_by_name(
    search_query TEXT,
    p_content_type VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    torrent_id UUID,
    torrent_name TEXT,
    torrent_infohash VARCHAR(40),
    torrent_size BIGINT,
    torrent_file_count INTEGER,
    torrent_content_type VARCHAR(20),
    torrent_created_at TIMESTAMPTZ,
    rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS torrent_id,
    t.name AS torrent_name,
    t.infohash AS torrent_infohash,
    t.total_size AS torrent_size,
    t.file_count AS torrent_file_count,
    t.content_type AS torrent_content_type,
    t.created_at AS torrent_created_at,
    ts_rank(to_tsvector('english', t.name), plainto_tsquery('english', search_query)) AS rank
  FROM public.torrents t
  WHERE
    t.status = 'ready'
    AND (search_query IS NULL OR search_query = '' OR
         to_tsvector('english', t.name) @@ plainto_tsquery('english', search_query))
    AND (p_content_type IS NULL OR t.content_type = p_content_type)
  ORDER BY rank DESC, t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- search_all
CREATE FUNCTION public.search_all(
    search_query TEXT,
    p_content_type VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    torrent_id UUID,
    torrent_name TEXT,
    torrent_infohash VARCHAR(40),
    torrent_size BIGINT,
    torrent_file_count INTEGER,
    torrent_content_type VARCHAR(20),
    torrent_created_at TIMESTAMPTZ,
    rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS torrent_id,
    t.name AS torrent_name,
    t.infohash AS torrent_infohash,
    t.total_size AS torrent_size,
    t.file_count AS torrent_file_count,
    t.content_type AS torrent_content_type,
    t.created_at AS torrent_created_at,
    ts_rank(to_tsvector('english', t.name), plainto_tsquery('english', search_query)) AS rank
  FROM public.torrents t
  WHERE
    t.status = 'ready'
    AND (search_query IS NULL OR search_query = '' OR
         to_tsvector('english', t.name) @@ plainto_tsquery('english', search_query))
    AND (p_content_type IS NULL OR t.content_type = p_content_type)
  ORDER BY rank DESC, t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- create_trial_subscription (for user_subscriptions table)
CREATE FUNCTION public.create_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.user_subscriptions (
        user_id,
        tier,
        status,
        trial_started_at,
        trial_expires_at
    ) VALUES (
        NEW.id,
        'trial',
        'active',
        NOW(),
        NOW() + INTERVAL '3 days'
    );
    RETURN NEW;
END;
$$;

-- get_subscription_status (matching original signature)
CREATE FUNCTION public.get_subscription_status(p_user_id UUID)
RETURNS TABLE (
    subscription_id UUID,
    tier VARCHAR(20),
    status VARCHAR(20),
    is_active BOOLEAN,
    days_remaining INTEGER,
    expires_at TIMESTAMPTZ,
    needs_renewal BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sub RECORD;
    v_expires TIMESTAMPTZ;
    v_is_active BOOLEAN;
    v_days_remaining INTEGER;
BEGIN
    SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Determine expiry date based on tier
    IF v_sub.tier = 'trial' THEN
        v_expires := v_sub.trial_expires_at;
    ELSE
        v_expires := v_sub.subscription_expires_at;
    END IF;
    
    -- Calculate if active
    v_is_active := v_sub.status = 'active' AND v_expires > NOW();
    
    -- Calculate days remaining
    IF v_expires > NOW() THEN
        v_days_remaining := CEIL(EXTRACT(EPOCH FROM (v_expires - NOW())) / 86400);
    ELSE
        v_days_remaining := 0;
    END IF;
    
    RETURN QUERY SELECT
        v_sub.id,
        v_sub.tier,
        v_sub.status,
        v_is_active,
        v_days_remaining,
        v_expires,
        (v_sub.tier IN ('premium', 'family') AND v_days_remaining <= 7 AND v_days_remaining > 0);
END;
$$;

-- activate_subscription (matching original signature - returns user_subscriptions)
CREATE FUNCTION public.activate_subscription(
    p_user_id UUID,
    p_tier VARCHAR(20),
    p_duration_months INTEGER DEFAULT 12
)
RETURNS public.user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sub public.user_subscriptions;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
BEGIN
    -- Get current subscription
    SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = p_user_id;
    
    -- Calculate subscription period
    -- If currently active, extend from current expiry; otherwise start from now
    IF v_sub.subscription_expires_at IS NOT NULL AND v_sub.subscription_expires_at > NOW() THEN
        v_start := v_sub.subscription_expires_at;
    ELSE
        v_start := NOW();
    END IF;
    
    v_end := v_start + (p_duration_months || ' months')::INTERVAL;
    
    -- Update subscription
    UPDATE public.user_subscriptions
    SET
        tier = p_tier,
        status = 'active',
        subscription_started_at = COALESCE(subscription_started_at, NOW()),
        subscription_expires_at = v_end,
        renewal_reminder_7d_sent = FALSE,
        renewal_reminder_3d_sent = FALSE,
        renewal_reminder_1d_sent = FALSE,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO v_sub;
    
    RETURN v_sub;
END;
$$;

-- get_subscriptions_needing_reminders (matching original signature)
CREATE FUNCTION public.get_subscriptions_needing_reminders(p_days_before INTEGER)
RETURNS TABLE (
    user_id UUID,
    tier VARCHAR(20),
    subscription_expires_at TIMESTAMPTZ,
    days_until_expiry INTEGER,
    user_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        us.user_id,
        us.tier,
        us.subscription_expires_at,
        CEIL(EXTRACT(EPOCH FROM (us.subscription_expires_at - NOW())) / 86400)::INTEGER as days_until_expiry,
        au.email as user_email
    FROM public.user_subscriptions us
    JOIN auth.users au ON us.user_id = au.id
    WHERE 
        us.status = 'active'
        AND us.tier IN ('premium', 'family')
        AND us.subscription_expires_at > NOW()
        AND us.subscription_expires_at <= NOW() + (p_days_before || ' days')::INTERVAL
        AND (
            (p_days_before = 7 AND NOT us.renewal_reminder_7d_sent)
            OR (p_days_before = 3 AND NOT us.renewal_reminder_3d_sent)
            OR (p_days_before = 1 AND NOT us.renewal_reminder_1d_sent)
        );
END;
$$;

-- mark_renewal_reminder_sent (matching original signature with INTEGER parameter)
CREATE FUNCTION public.mark_renewal_reminder_sent(
    p_user_id UUID,
    p_days_before INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.user_subscriptions
    SET
        renewal_reminder_sent_at = NOW(),
        renewal_reminder_7d_sent = CASE WHEN p_days_before = 7 THEN TRUE ELSE renewal_reminder_7d_sent END,
        renewal_reminder_3d_sent = CASE WHEN p_days_before = 3 THEN TRUE ELSE renewal_reminder_3d_sent END,
        renewal_reminder_1d_sent = CASE WHEN p_days_before = 1 THEN TRUE ELSE renewal_reminder_1d_sent END,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$;

-- ============================================================================
-- Recreate the trigger for create_trial_subscription
-- ============================================================================
CREATE TRIGGER on_auth_user_created_subscription
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_trial_subscription();
