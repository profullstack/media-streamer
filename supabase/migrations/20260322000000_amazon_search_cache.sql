-- Cache Amazon/Rainforest API search results to reduce API calls
-- Results cached for 30 days (checked in application code)

CREATE TABLE IF NOT EXISTS amazon_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_key TEXT UNIQUE NOT NULL, -- normalized: "title|contentType"
  title TEXT NOT NULL,
  content_type TEXT,
  result JSONB, -- null = no result found (also cached to avoid re-querying)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX idx_amazon_cache_search_key ON amazon_search_cache(search_key);
CREATE INDEX idx_amazon_cache_expires ON amazon_search_cache(expires_at);

-- RLS: service role only
ALTER TABLE amazon_search_cache ENABLE ROW LEVEL SECURITY;
