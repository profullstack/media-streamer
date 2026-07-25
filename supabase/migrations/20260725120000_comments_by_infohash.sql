-- Comments on any torrent: DHT and indexed
--
-- Comments were keyed on bt_torrent_comments.torrent_id, a UUID FK into bt_torrents.
-- That made commenting impossible for:
--   * DHT torrents, which have no bt_torrents row at all (only an infohash), and
--   * indexed torrents reached through their infohash URL (/torrents/<40-hex>),
--     because the API rejected any :id that wasn't a UUID.
--
-- Re-key comments on the infohash, which every torrent has regardless of source.
-- A DHT torrent that later gets indexed keeps its existing comment thread.

-- ============================================
-- ADD INFOHASH
-- ============================================
ALTER TABLE bt_torrent_comments ADD COLUMN IF NOT EXISTS infohash TEXT;

-- Backfill from the linked torrent. Comments cascade-delete with their torrent,
-- so every existing row resolves; SET NOT NULL below fails loudly if one doesn't.
UPDATE bt_torrent_comments c
SET infohash = lower(t.infohash)
FROM bt_torrents t
WHERE c.torrent_id = t.id
  AND c.infohash IS NULL;

-- ============================================
-- TORRENT_ID BECOMES OPTIONAL
-- ============================================
-- Kept as a denormalized convenience pointer for indexed torrents.
-- DHT comments have no bt_torrents row, so it must be nullable and unconstrained.
ALTER TABLE bt_torrent_comments DROP CONSTRAINT IF EXISTS torrent_comments_torrent_id_fkey;
ALTER TABLE bt_torrent_comments ALTER COLUMN torrent_id DROP NOT NULL;

-- ============================================
-- INFOHASH BECOMES THE THREAD KEY
-- ============================================
ALTER TABLE bt_torrent_comments
  DROP CONSTRAINT IF EXISTS bt_torrent_comments_infohash_format;
ALTER TABLE bt_torrent_comments
  ADD CONSTRAINT bt_torrent_comments_infohash_format
  CHECK (infohash ~ '^[0-9a-f]{40}$');

ALTER TABLE bt_torrent_comments ALTER COLUMN infohash SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bt_torrent_comments_infohash
  ON bt_torrent_comments(infohash);
CREATE INDEX IF NOT EXISTS idx_bt_torrent_comments_infohash_created
  ON bt_torrent_comments(infohash, created_at DESC);

-- The old torrent_id index is no longer the read path
DROP INDEX IF EXISTS idx_torrent_comments_torrent_id;

-- ============================================
-- COMMENT AUTHOR DISPLAY NAMES
-- ============================================
-- The repository previously returned a hardcoded 'user@example.com' for every
-- comment, so all authors rendered as the same name. Expose the profile name
-- through a view the service role can read.
CREATE OR REPLACE VIEW bt_torrent_comments_with_author
WITH (security_invoker = true) AS
SELECT
    c.id,
    c.infohash,
    c.torrent_id,
    c.user_id,
    c.profile_id,
    c.content,
    c.parent_id,
    c.upvotes,
    c.downvotes,
    c.deleted_at,
    c.created_at,
    c.updated_at,
    COALESCE(NULLIF(TRIM(p.name), ''), 'Anonymous') AS author_name,
    p.avatar_emoji AS author_avatar_emoji
FROM bt_torrent_comments c
LEFT JOIN profiles p ON p.id = c.profile_id;
