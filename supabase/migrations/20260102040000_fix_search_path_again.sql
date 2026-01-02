-- Migration: Re-apply search_path fix for all functions
-- This ensures the search_path is set to '' for security
-- Addresses Supabase linter warning: function_search_path_mutable

-- ============================================================================
-- Drop functions that need signature changes first
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrent_files(TEXT, VARCHAR, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_subscription_status(UUID);
DROP FUNCTION IF EXISTS public.get_subscriptions_needing_reminders(INTEGER);

-- ============================================================================
-- Fix all functions with mutable search_path
-- Setting search_path = '' prevents search path injection attacks
-- ============================================================================

-- Fix update_torrent_folders_updated_at
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

-- Fix update_updated_at_column
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

-- Fix search_files
CREATE OR REPLACE FUNCTION public.search_files(
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

-- Fix search_torrent_files
CREATE OR REPLACE FUNCTION public.search_torrent_files(
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

-- Fix search_torrents
CREATE OR REPLACE FUNCTION public.search_torrents(
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

-- Fix search_torrents_by_name
CREATE OR REPLACE FUNCTION public.search_torrents_by_name(
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

-- Fix search_all
CREATE OR REPLACE FUNCTION public.search_all(
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

-- Fix create_trial_subscription
CREATE OR REPLACE FUNCTION public.create_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    trial_ends_at,
    current_period_start,
    current_period_end
  ) VALUES (
    NEW.id,
    'trial',
    'trialing',
    NOW() + INTERVAL '3 days',
    NOW(),
    NOW() + INTERVAL '3 days'
  );
  RETURN NEW;
END;
$$;

-- Fix get_subscription_status
CREATE OR REPLACE FUNCTION public.get_subscription_status(p_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan VARCHAR(20),
  status VARCHAR(20),
  is_active BOOLEAN,
  days_remaining INTEGER,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS subscription_id,
    s.plan,
    s.status,
    CASE
      WHEN s.status = 'active' AND s.current_period_end > NOW() THEN TRUE
      WHEN s.status = 'trialing' AND s.trial_ends_at > NOW() THEN TRUE
      ELSE FALSE
    END AS is_active,
    CASE
      WHEN s.status = 'trialing' THEN
        GREATEST(0, EXTRACT(DAY FROM s.trial_ends_at - NOW())::INTEGER)
      WHEN s.status = 'active' THEN
        GREATEST(0, EXTRACT(DAY FROM s.current_period_end - NOW())::INTEGER)
      ELSE 0
    END AS days_remaining,
    s.trial_ends_at,
    s.current_period_end
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

-- Fix activate_subscription
CREATE OR REPLACE FUNCTION public.activate_subscription(
    p_user_id UUID,
    p_plan VARCHAR(20),
    p_payment_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subscription_id UUID;
BEGIN
  -- Update existing subscription or create new one
  UPDATE public.subscriptions
  SET
    plan = p_plan,
    status = 'active',
    current_period_start = NOW(),
    current_period_end = NOW() + INTERVAL '1 year',
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING id INTO v_subscription_id;
  
  IF v_subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (
      user_id,
      plan,
      status,
      current_period_start,
      current_period_end
    ) VALUES (
      p_user_id,
      p_plan,
      'active',
      NOW(),
      NOW() + INTERVAL '1 year'
    )
    RETURNING id INTO v_subscription_id;
  END IF;
  
  -- Link payment to subscription
  UPDATE public.payments
  SET subscription_id = v_subscription_id
  WHERE id = p_payment_id;
  
  RETURN v_subscription_id;
END;
$$;

-- Fix get_subscriptions_needing_reminders
CREATE OR REPLACE FUNCTION public.get_subscriptions_needing_reminders(p_days_before INTEGER)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  plan VARCHAR(20),
  expires_at TIMESTAMPTZ,
  days_until_expiry INTEGER
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.user_id,
    u.email,
    s.plan,
    s.current_period_end AS expires_at,
    EXTRACT(DAY FROM s.current_period_end - NOW())::INTEGER AS days_until_expiry
  FROM public.subscriptions s
  JOIN auth.users u ON s.user_id = u.id
  WHERE
    s.status = 'active'
    AND s.current_period_end > NOW()
    AND s.current_period_end <= NOW() + (p_days_before || ' days')::INTERVAL
    AND (s.renewal_reminder_sent_at IS NULL
         OR s.renewal_reminder_sent_at < NOW() - INTERVAL '7 days');
END;
$$;

-- Fix mark_renewal_reminder_sent
CREATE OR REPLACE FUNCTION public.mark_renewal_reminder_sent(
    p_user_id UUID,
    p_sent_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.subscriptions
  SET renewal_reminder_sent_at = p_sent_at
  WHERE user_id = p_user_id;
END;
$$;
