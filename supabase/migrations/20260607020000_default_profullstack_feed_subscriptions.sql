-- Default RSS feed subscriptions
--
-- Every subscriber profile should be subscribed to the Profullstack, Inc.
-- property blogs by default. Subscriptions are normal rows in
-- rss_subscriptions, so users can unsubscribe (delete) them at any time.
--
-- This is data-driven: any feed flagged is_default = true is auto-subscribed
-- for existing profiles (backfill below) and for every new profile (trigger
-- below). Add more house feeds later by inserting another is_default row.
--
-- Default subscriptions land in the "Profullstack, Inc." folder so they group
-- together in the reader sidebar and in OPML exports.

-- ============================================
-- 1. Mark feeds that should be subscribed by default
-- ============================================
ALTER TABLE rss_feeds
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rss_feeds_is_default
  ON rss_feeds(is_default) WHERE is_default = true;

-- ============================================
-- 2. Register the house feeds (Profullstack, Inc. property blogs)
-- ============================================
-- The reader/refresh job overwrites title/description/etc. on first fetch;
-- these values are just a sensible placeholder until then. feed_url is the
-- actual machine-readable feed (bittorrented.com/rss is the reader UI page,
-- not a feed). Some routes (saasrow, vu1nz) are not live yet; they are still
-- registered and will begin populating once their /blog/rss.xml ships.
INSERT INTO rss_feeds (feed_url, site_url, title, description, language, is_default)
VALUES
  ('https://bittorrented.com/blog/rss.xml', 'https://bittorrented.com/blog', 'BitTorrented Blog', 'Streaming, torrents, IPTV, and media tech from the BitTorrented team.', 'en', true),
  ('https://bl0ggers.com/blog/rss.xml',     'https://bl0ggers.com/blog',     'bl0ggers Blog',     'Blogging tools and content automation from bl0ggers.', 'en', true),
  ('https://c0mpute.com/blog/rss.xml',      'https://c0mpute.com/blog',      'c0mpute Blog',      'Cloud compute, GPUs, and infrastructure notes from c0mpute.', 'en', true),
  ('https://c0upons.com/blog/rss.xml',      'https://c0upons.com/blog',      'c0upons Blog',      'Deal tips, savings guides, and community updates from c0upons.', 'en', true),
  ('https://coinpayportal.com/blog/rss.xml','https://coinpayportal.com/blog','CoinPayPortal Blog','Crypto payments, invoicing, and merchant tooling from CoinPayPortal.', 'en', true),
  ('https://crawlproof.com/blog/rss.xml',   'https://crawlproof.com/blog',   'CrawlProof Blog',   'AEO, AI crawlers, schema, and answer-engine optimization from CrawlProof.', 'en', true),
  ('https://d0rz.com/blog/rss.xml',         'https://d0rz.com/blog',         'd0rz Blog',         'Notes from the d0rz team and partners.', 'en', true),
  ('https://pairux.com/blog/rss.xml',       'https://pairux.com/blog',       'PairUX Blog',       'News, updates, and tutorials from the PairUX team.', 'en', true),
  ('https://qrypt.chat/blog/rss.xml',       'https://qrypt.chat/blog',       'qrypt.chat Blog',   'Encrypted messaging and privacy engineering from qrypt.chat.', 'en', true),
  ('https://saasrow.com/blog/rss.xml',      'https://saasrow.com/blog',      'SaaSRow Blog',      'SaaS growth, tooling, and operations from SaaSRow.', 'en', true),
  ('https://sh1pt.com/blog/rss.xml',        'https://sh1pt.com/blog',        'sh1pt Blog',        'Shipping, logistics, and fulfillment tech from sh1pt.', 'en', true),
  ('https://threatcrush.com/blog/rss.xml',  'https://threatcrush.com/blog',  'ThreatCrush Blog',  'Threat intelligence and security operations from ThreatCrush.', 'en', true),
  ('https://ugig.net/blog/rss.xml',         'https://ugig.net/blog',         'uGig Blog',         'Gig work, freelancing, and marketplace updates from uGig.', 'en', true),
  ('https://vu1nz.com/blog/rss.xml',        'https://vu1nz.com/blog',        'vu1nz Blog',        'Supply-chain and CI/CD security from vu1nz.', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET is_default = true;

-- ============================================
-- 3. Backfill: subscribe every existing profile to every default feed
-- ============================================
INSERT INTO rss_subscriptions (profile_id, feed_id, folder)
SELECT p.id, f.id, 'Profullstack, Inc.'
FROM profiles p
CROSS JOIN rss_feeds f
WHERE f.is_default = true
ON CONFLICT (profile_id, feed_id) DO NOTHING;

-- ============================================
-- 4. Auto-subscribe new profiles to every default feed
-- ============================================
CREATE OR REPLACE FUNCTION subscribe_default_feeds_on_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO rss_subscriptions (profile_id, feed_id, folder)
  SELECT NEW.id, f.id, 'Profullstack, Inc.'
  FROM rss_feeds f
  WHERE f.is_default = true
  ON CONFLICT (profile_id, feed_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subscribe_default_feeds ON profiles;
CREATE TRIGGER trigger_subscribe_default_feeds
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION subscribe_default_feeds_on_profile();
