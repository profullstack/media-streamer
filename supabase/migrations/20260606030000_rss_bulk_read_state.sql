-- Bulk mark RSS items read/unread for a profile, optionally scoped to one feed.

CREATE OR REPLACE FUNCTION public.rss_mark_items_read_state(
  p_profile_id UUID,
  p_feed_id UUID,
  p_is_read BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_is_read THEN
    WITH target_items AS (
      SELECT i.id
      FROM rss_feed_items i
      JOIN rss_subscriptions s ON s.feed_id = i.feed_id
      WHERE s.profile_id = p_profile_id
        AND s.is_active = TRUE
        AND (p_feed_id IS NULL OR s.feed_id = p_feed_id)
    ),
    upserted AS (
      INSERT INTO rss_item_states (profile_id, item_id, is_read, read_at, updated_at)
      SELECT p_profile_id, id, TRUE, NOW(), NOW()
      FROM target_items
      ON CONFLICT (profile_id, item_id) DO UPDATE
        SET is_read = TRUE,
            read_at = NOW(),
            updated_at = NOW()
        WHERE rss_item_states.is_read IS DISTINCT FROM TRUE
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM upserted;
  ELSE
    WITH target_items AS (
      SELECT i.id
      FROM rss_feed_items i
      JOIN rss_subscriptions s ON s.feed_id = i.feed_id
      WHERE s.profile_id = p_profile_id
        AND s.is_active = TRUE
        AND (p_feed_id IS NULL OR s.feed_id = p_feed_id)
    ),
    updated AS (
      UPDATE rss_item_states state
      SET is_read = FALSE,
          read_at = NULL,
          updated_at = NOW()
      FROM target_items
      WHERE state.profile_id = p_profile_id
        AND state.item_id = target_items.id
        AND state.is_read IS DISTINCT FROM FALSE
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM updated;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rss_mark_items_read_state(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rss_mark_items_read_state(UUID, UUID, BOOLEAN) TO service_role;
