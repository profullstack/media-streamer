-- Cursor for the nichedb -> imdb_* mirror (scripts/mirror-imdb-from-nichedb.ts).
--
-- bittorrented used to download the IMDb daily dumps (title.basics, title.ratings,
-- ...) every night and COPY them into the imdb_* tables. nichedb.dev's `screen`
-- collection already carries every IMDb title with a rating, so the mirror walks
-- that collection over its public API instead and upserts imdb_title_basics and
-- imdb_title_ratings. The walk is id-ordered (`sort=id&order=asc&after=<id>`) and
-- capped per run to stay inside nichedb's 600 requests/hour, so it has to remember
-- where it stopped: that is this table.
--
--   after_id  last item id seen on the current walk (0 = start from the beginning)
--   since     `since=` sent with every page of the current walk (NULL on the first,
--             full backfill); set to the walk's own start time once it completes, so
--             the next walk only asks for items updated after that
--
-- One row per mirror name; the IMDb mirror uses 'imdb-titles'.

CREATE TABLE IF NOT EXISTS nichedb_mirror_cursor (
  name        TEXT PRIMARY KEY,
  after_id    BIGINT NOT NULL DEFAULT 0,
  since       TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nichedb_mirror_cursor IS
  'Resume point for scripts/mirror-imdb-from-nichedb.ts: last nichedb item id seen on the current walk and the since= watermark it was started with.';

ALTER TABLE nichedb_mirror_cursor ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (which bypasses RLS) reads or
-- writes the cursor.
