-- Bulk OPML import for the RSS reader.
--
-- Importing a large OPML (Kagi Small Web is ~47k feeds) one feed at a time is
-- two round trips per feed, which no HTTP request can survive. This does the
-- whole batch as a single statement: insert the feeds we don't have yet, then
-- subscribe the profile to every feed in the batch.

CREATE OR REPLACE FUNCTION public.rss_import_opml_feeds(
  p_profile_id UUID,
  p_feeds JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (feed.feed_url)
      feed.feed_url,
      NULLIF(BTRIM(feed.site_url), '') AS site_url,
      COALESCE(NULLIF(BTRIM(feed.title), ''), feed.feed_url) AS title,
      NULLIF(BTRIM(feed.folder), '') AS folder
    FROM jsonb_to_recordset(p_feeds)
      AS feed(feed_url TEXT, site_url TEXT, title TEXT, folder TEXT)
    WHERE NULLIF(BTRIM(feed.feed_url), '') IS NOT NULL
    ORDER BY feed.feed_url
  ),
  -- Insert new feeds only. An OPML outline carries no fetch state, so it must
  -- never overwrite the title or items of a feed somebody has already fetched.
  inserted_feeds AS (
    INSERT INTO rss_feeds (feed_url, site_url, title)
    SELECT feed_url, site_url, title FROM incoming
    ON CONFLICT (feed_url) DO NOTHING
    RETURNING id, feed_url
  ),
  -- CTEs read the pre-statement snapshot, so rows from inserted_feeds are not
  -- visible in a plain scan of rss_feeds and have to be unioned back in.
  resolved AS (
    SELECT DISTINCT ON (matched.feed_url)
      matched.id AS feed_id,
      incoming.title,
      incoming.folder
    FROM incoming
    JOIN (
      SELECT id, feed_url FROM inserted_feeds
      UNION ALL
      SELECT id, feed_url FROM rss_feeds
      WHERE feed_url IN (SELECT feed_url FROM incoming)
    ) AS matched ON matched.feed_url = incoming.feed_url
    ORDER BY matched.feed_url
  ),
  subscribed AS (
    INSERT INTO rss_subscriptions (
      profile_id, feed_id, custom_title, folder, notify_new_items, is_active
    )
    SELECT p_profile_id, feed_id, title, folder, FALSE, TRUE FROM resolved
    ON CONFLICT (profile_id, feed_id) DO UPDATE
      SET folder = COALESCE(EXCLUDED.folder, rss_subscriptions.folder),
          is_active = TRUE,
          updated_at = NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM subscribed;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rss_import_opml_feeds(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rss_import_opml_feeds(UUID, JSONB) TO service_role;
