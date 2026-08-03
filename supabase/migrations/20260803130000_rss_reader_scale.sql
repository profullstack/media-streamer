-- Reader queries that survive a 47k-feed subscription list.
--
-- listItems() read every subscribed feed id into the app and sent them back as
-- a PostgREST `feed_id=in.(...)` filter. After importing Kagi's Small Web OPML
-- that list is 47k UUIDs, so the request URL is ~1.8 MB and the API gateway
-- rejects it long before Postgres sees the query: the reader answered 500 and
-- the page showed "Failed to load RSS reader". The join belongs in SQL.
--
-- Two other things move into SQL with it:
--   * the unread/saved filters, which the app applied *after* LIMIT, so a page
--     of 50 could come back with 3 rows once most articles were read;
--   * a per-feed cap, so one prolific feed cannot crowd 47k others out of the
--     list.

-- Feeds the newest-per-feed lateral below.
CREATE INDEX IF NOT EXISTS idx_rss_feed_items_feed_published
  ON rss_feed_items(feed_id, published_at DESC NULLS LAST, created_at DESC);

-- Every column reference in these bodies is table-qualified on purpose: RETURNS
-- TABLE names are visible inside the body and an unqualified `title` or
-- `folder` would be ambiguous against the tables.

CREATE OR REPLACE FUNCTION public.rss_list_items(
  p_profile_id UUID,
  p_feed_id UUID DEFAULT NULL,
  p_unread_only BOOLEAN DEFAULT FALSE,
  p_saved_only BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_per_feed_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  feed_id UUID,
  guid TEXT,
  title TEXT,
  link TEXT,
  author TEXT,
  summary TEXT,
  content TEXT,
  image_url TEXT,
  enclosure_url TEXT,
  enclosure_type TEXT,
  published_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  feed_title TEXT,
  feed_url TEXT,
  feed_site_url TEXT,
  feed_image_url TEXT,
  is_read BOOLEAN,
  is_saved BOOLEAN,
  read_at TIMESTAMPTZ,
  saved_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH subscribed AS (
    SELECT
      sub.feed_id AS feed_id,
      COALESCE(NULLIF(BTRIM(sub.custom_title), ''), feed.title) AS feed_title,
      feed.feed_url AS feed_url,
      feed.site_url AS feed_site_url,
      feed.image_url AS feed_image_url
    FROM rss_subscriptions sub
    JOIN rss_feeds feed ON feed.id = sub.feed_id
    WHERE sub.profile_id = p_profile_id
      AND sub.is_active
      AND (p_feed_id IS NULL OR sub.feed_id = p_feed_id)
  ),
  recent AS (
    -- One index probe per subscribed feed rather than a sort over every item.
    SELECT
      newest.id AS id,
      newest.feed_id AS feed_id,
      newest.guid AS guid,
      newest.title AS title,
      newest.link AS link,
      newest.author AS author,
      newest.summary AS summary,
      newest.content AS content,
      newest.image_url AS image_url,
      newest.enclosure_url AS enclosure_url,
      newest.enclosure_type AS enclosure_type,
      newest.published_at AS published_at,
      newest.source_updated_at AS source_updated_at,
      newest.created_at AS created_at,
      subscribed.feed_title AS feed_title,
      subscribed.feed_url AS feed_url,
      subscribed.feed_site_url AS feed_site_url,
      subscribed.feed_image_url AS feed_image_url
    FROM subscribed
    CROSS JOIN LATERAL (
      SELECT item.*
      FROM rss_feed_items item
      WHERE item.feed_id = subscribed.feed_id
      ORDER BY item.published_at DESC NULLS LAST, item.created_at DESC
      LIMIT GREATEST(COALESCE(p_per_feed_limit, 100), 1)
    ) AS newest
  )
  SELECT
    recent.id,
    recent.feed_id,
    recent.guid,
    recent.title,
    recent.link,
    recent.author,
    recent.summary,
    recent.content,
    recent.image_url,
    recent.enclosure_url,
    recent.enclosure_type,
    recent.published_at,
    recent.source_updated_at,
    recent.created_at,
    recent.feed_title,
    recent.feed_url,
    recent.feed_site_url,
    recent.feed_image_url,
    COALESCE(state.is_read, FALSE) AS is_read,
    COALESCE(state.is_saved, FALSE) AS is_saved,
    state.read_at AS read_at,
    state.saved_at AS saved_at
  FROM recent
  LEFT JOIN rss_item_states state
    ON state.item_id = recent.id
   AND state.profile_id = p_profile_id
  WHERE (NOT COALESCE(p_unread_only, FALSE) OR COALESCE(state.is_read, FALSE) = FALSE)
    AND (NOT COALESCE(p_saved_only, FALSE) OR COALESCE(state.is_saved, FALSE) = TRUE)
  ORDER BY recent.published_at DESC NULLS LAST, recent.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- The sidebar cannot ship 47k subscriptions (19 MB of JSON, 47k DOM rows), so
-- it asks for a searchable page and the total it was taken from.
CREATE OR REPLACE FUNCTION public.rss_list_subscriptions(
  p_profile_id UUID,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  feed_id UUID,
  custom_title TEXT,
  folder TEXT,
  notify_new_items BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  feed_title TEXT,
  feed_url TEXT,
  feed_site_url TEXT,
  feed_image_url TEXT,
  feed_last_fetched_at TIMESTAMPTZ,
  feed_last_fetch_error TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT
      sub.id AS id,
      sub.feed_id AS feed_id,
      sub.custom_title AS custom_title,
      sub.folder AS folder,
      sub.notify_new_items AS notify_new_items,
      sub.created_at AS created_at,
      sub.updated_at AS updated_at,
      feed.title AS feed_title,
      feed.feed_url AS feed_url,
      feed.site_url AS feed_site_url,
      feed.image_url AS feed_image_url,
      feed.last_fetched_at AS feed_last_fetched_at,
      feed.last_fetch_error AS feed_last_fetch_error,
      COALESCE(NULLIF(BTRIM(sub.custom_title), ''), feed.title) AS sort_title
    FROM rss_subscriptions sub
    JOIN rss_feeds feed ON feed.id = sub.feed_id
    WHERE sub.profile_id = p_profile_id
      AND sub.is_active
      AND (
        NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NULL
        OR COALESCE(sub.custom_title, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR feed.title ILIKE '%' || BTRIM(p_search) || '%'
        OR feed.feed_url ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(sub.folder, '') ILIKE '%' || BTRIM(p_search) || '%'
      )
  )
  SELECT
    matched.id,
    matched.feed_id,
    matched.custom_title,
    matched.folder,
    matched.notify_new_items,
    matched.created_at,
    matched.updated_at,
    matched.feed_title,
    matched.feed_url,
    matched.feed_site_url,
    matched.feed_image_url,
    matched.feed_last_fetched_at,
    matched.feed_last_fetch_error,
    COUNT(*) OVER () AS total_count
  FROM matched
  ORDER BY matched.folder ASC NULLS LAST, matched.sort_title ASC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Folder names for the sidebar tree, which must stay complete even when the
-- subscription page above only carries a slice of the feeds.
CREATE OR REPLACE FUNCTION public.rss_list_folders(p_profile_id UUID)
RETURNS TABLE (folder TEXT, feed_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sub.folder, COUNT(*) AS feed_count
  FROM rss_subscriptions sub
  WHERE sub.profile_id = p_profile_id
    AND sub.is_active
    AND NULLIF(BTRIM(COALESCE(sub.folder, '')), '') IS NOT NULL
  GROUP BY sub.folder
  ORDER BY sub.folder ASC;
$$;

-- Feeds are only worth keeping recent history for, and 47k feeds x unbounded
-- archive is not a table anyone wants. Saved articles are exempt: dropping one
-- would cascade the state row and lose the bookmark.
CREATE OR REPLACE FUNCTION public.rss_prune_feed_items(
  p_feed_id UUID,
  p_keep INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH ranked AS (
    SELECT
      item.id AS id,
      ROW_NUMBER() OVER (
        ORDER BY item.published_at DESC NULLS LAST, item.created_at DESC
      ) AS position
    FROM rss_feed_items item
    WHERE item.feed_id = p_feed_id
  ),
  deleted AS (
    DELETE FROM rss_feed_items item
    USING ranked
    WHERE item.id = ranked.id
      AND ranked.position > GREATEST(COALESCE(p_keep, 100), 1)
      AND NOT EXISTS (
        SELECT 1 FROM rss_item_states state
        WHERE state.item_id = item.id AND state.is_saved
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rss_list_items(UUID, UUID, BOOLEAN, BOOLEAN, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rss_list_items(UUID, UUID, BOOLEAN, BOOLEAN, INTEGER, INTEGER, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.rss_list_subscriptions(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rss_list_subscriptions(UUID, TEXT, INTEGER, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.rss_list_folders(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rss_list_folders(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.rss_prune_feed_items(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rss_prune_feed_items(UUID, INTEGER) TO service_role;
