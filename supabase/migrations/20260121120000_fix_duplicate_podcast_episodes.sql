-- Fix duplicate podcast episodes caused by GUID variations
-- This migration:
-- 1. Identifies duplicate episodes by audio_url (same file = same episode)
-- 2. Keeps the oldest entry (first created)
-- 3. Deletes newer duplicates
-- 4. Updates notification_history and listen_progress to point to kept episodes

-- First, create a temp table to identify duplicates and which ones to keep
CREATE TEMP TABLE duplicate_episodes AS
WITH ranked AS (
  SELECT
    id,
    podcast_id,
    audio_url,
    guid,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY podcast_id, audio_url
      ORDER BY created_at ASC
    ) as rn
  FROM podcast_episodes
)
SELECT
  r1.id as duplicate_id,
  r2.id as keep_id
FROM ranked r1
JOIN ranked r2 ON r1.podcast_id = r2.podcast_id
  AND r1.audio_url = r2.audio_url
  AND r2.rn = 1
WHERE r1.rn > 1;

-- Log how many duplicates we're fixing
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM duplicate_episodes;
  RAISE NOTICE 'Found % duplicate podcast episodes to clean up', dup_count;
END $$;

-- Update listen progress to point to the kept episode
UPDATE podcast_listen_progress plp
SET episode_id = de.keep_id
FROM duplicate_episodes de
WHERE plp.episode_id = de.duplicate_id;

-- Update notification history to point to the kept episode
UPDATE notification_history nh
SET episode_id = de.keep_id
FROM duplicate_episodes de
WHERE nh.episode_id = de.duplicate_id;

-- Delete the duplicate episodes
DELETE FROM podcast_episodes pe
USING duplicate_episodes de
WHERE pe.id = de.duplicate_id;

-- Clean up
DROP TABLE duplicate_episodes;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Duplicate podcast episodes cleanup complete';
END $$;
