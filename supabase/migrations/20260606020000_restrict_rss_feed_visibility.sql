-- Restrict RSS feed rows to profiles that are subscribed to them.
-- Private email sender feeds include signed URLs, so feed URLs must not be
-- globally visible to every authenticated user.

DROP POLICY IF EXISTS "Authenticated users can view rss feeds" ON rss_feeds;
DROP POLICY IF EXISTS "Authenticated users can view rss feed items" ON rss_feed_items;

CREATE POLICY "Users can view subscribed rss feeds"
  ON rss_feeds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rss_subscriptions s
      JOIN profiles p ON p.id = s.profile_id
      WHERE s.feed_id = rss_feeds.id
        AND s.is_active = true
        AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can view subscribed rss feed items"
  ON rss_feed_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rss_subscriptions s
      JOIN profiles p ON p.id = s.profile_id
      WHERE s.feed_id = rss_feed_items.feed_id
        AND s.is_active = true
        AND p.account_id = auth.uid()
    )
  );
