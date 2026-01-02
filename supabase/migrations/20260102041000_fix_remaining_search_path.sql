-- Migration: Fix remaining search_path issues
-- Uses ALTER FUNCTION to set search_path on existing functions
-- This is more reliable than CREATE OR REPLACE for SECURITY DEFINER functions

-- ============================================================================
-- Use ALTER FUNCTION to set search_path directly
-- This ensures the setting is applied regardless of function signature
-- ============================================================================

-- Fix search_files - drop all overloads and recreate
DROP FUNCTION IF EXISTS public.search_files(TEXT);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING, INTEGER, INTEGER);

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

-- Fix activate_subscription - drop all overloads and recreate
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.activate_subscription(UUID, CHARACTER VARYING, UUID);

CREATE FUNCTION public.activate_subscription(
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

-- Fix mark_renewal_reminder_sent - drop all overloads and recreate
DROP FUNCTION IF EXISTS public.mark_renewal_reminder_sent(UUID);
DROP FUNCTION IF EXISTS public.mark_renewal_reminder_sent(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.mark_renewal_reminder_sent(UUID, TIMESTAMP WITH TIME ZONE);

CREATE FUNCTION public.mark_renewal_reminder_sent(
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
