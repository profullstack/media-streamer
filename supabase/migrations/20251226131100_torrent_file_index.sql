-- Torrent and File Indexing Schema
-- Supports magnet URL ingestion and deep file-level search

-- ============================================================================
-- Torrents Table
-- Stores torrent metadata (no actual content)
-- ============================================================================

-- First, add missing columns to existing table if it exists
DO $$ 
BEGIN
  -- Check if torrents table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'torrents') THEN
    -- Add status column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'status') THEN
      ALTER TABLE torrents ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
      ALTER TABLE torrents ADD CONSTRAINT torrents_status_check 
        CHECK (status IN ('pending', 'indexing', 'ready', 'error'));
    END IF;

    -- Add error_message column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'error_message') THEN
      ALTER TABLE torrents ADD COLUMN error_message TEXT;
    END IF;

    -- Add indexed_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'indexed_at') THEN
      ALTER TABLE torrents ADD COLUMN indexed_at TIMESTAMPTZ;
    END IF;

    -- Add piece_length column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'piece_length') THEN
      ALTER TABLE torrents ADD COLUMN piece_length INTEGER;
    END IF;

    -- Add total_size column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'total_size') THEN
      ALTER TABLE torrents ADD COLUMN total_size BIGINT NOT NULL DEFAULT 0;
    END IF;

    -- Add file_count column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'file_count') THEN
      ALTER TABLE torrents ADD COLUMN file_count INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- Add created_by column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'created_by') THEN
      ALTER TABLE torrents ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;

    -- Add updated_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrents' AND column_name = 'updated_at') THEN
      ALTER TABLE torrents ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
  ELSE
    -- Create the table if it doesn't exist
    CREATE TABLE torrents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      infohash VARCHAR(40) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      magnet_uri TEXT NOT NULL,
      total_size BIGINT NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 0,
      piece_length INTEGER,
      created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'ready', 'error')),
      error_message TEXT,
      indexed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Index for fast infohash lookups (deduplication)
CREATE INDEX IF NOT EXISTS idx_torrents_infohash ON torrents(infohash);

-- Index for status filtering (only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'torrents' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_torrents_status ON torrents(status);
  END IF;
END $$;

-- Index for user's torrents (only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'torrents' AND column_name = 'created_by') THEN
    CREATE INDEX IF NOT EXISTS idx_torrents_created_by ON torrents(created_by);
  END IF;
END $$;

-- Full-text search index on torrent name
CREATE INDEX IF NOT EXISTS idx_torrents_name_search ON torrents USING gin(to_tsvector('english', name));

-- ============================================================================
-- Torrent Files Table
-- Stores individual files within torrents for deep search
-- ============================================================================

-- Add missing columns to torrent_files if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'torrent_files') THEN
    -- Add piece_start column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'piece_start') THEN
      ALTER TABLE torrent_files ADD COLUMN piece_start INTEGER;
    END IF;

    -- Add piece_end column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'piece_end') THEN
      ALTER TABLE torrent_files ADD COLUMN piece_end INTEGER;
    END IF;

    -- Add offset_in_first_piece column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'offset_in_first_piece') THEN
      ALTER TABLE torrent_files ADD COLUMN offset_in_first_piece INTEGER DEFAULT 0;
    END IF;

    -- Add extension column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'extension') THEN
      ALTER TABLE torrent_files ADD COLUMN extension VARCHAR(20);
    END IF;

    -- Add mime_type column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'mime_type') THEN
      ALTER TABLE torrent_files ADD COLUMN mime_type VARCHAR(100);
    END IF;

    -- Add media_type column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'media_type') THEN
      ALTER TABLE torrent_files ADD COLUMN media_type VARCHAR(20);
      ALTER TABLE torrent_files ADD CONSTRAINT torrent_files_media_type_check 
        CHECK (media_type IN ('audio', 'video', 'ebook', 'image', 'archive', 'other'));
    END IF;

    -- Add metadata column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'metadata') THEN
      ALTER TABLE torrent_files ADD COLUMN metadata JSONB;
    END IF;

    -- Add file_index column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'torrent_files' AND column_name = 'file_index') THEN
      ALTER TABLE torrent_files ADD COLUMN file_index INTEGER NOT NULL DEFAULT 0;
    END IF;
  ELSE
    -- Create the table if it doesn't exist
    CREATE TABLE torrent_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      torrent_id UUID NOT NULL REFERENCES torrents(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      file_index INTEGER NOT NULL,
      
      -- Piece mapping for selective streaming
      piece_start INTEGER,
      piece_end INTEGER,
      offset_in_first_piece INTEGER DEFAULT 0,
      
      -- File type detection
      extension VARCHAR(20),
      mime_type VARCHAR(100),
      media_type VARCHAR(20) CHECK (media_type IN ('audio', 'video', 'ebook', 'image', 'archive', 'other')),
      
      -- Optional metadata (lazy-loaded)
      metadata JSONB,
      
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Index for torrent file lookups
CREATE INDEX IF NOT EXISTS idx_torrent_files_torrent_id ON torrent_files(torrent_id);

-- Index for file extension filtering (only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'torrent_files' AND column_name = 'extension') THEN
    CREATE INDEX IF NOT EXISTS idx_torrent_files_extension ON torrent_files(extension);
  END IF;
END $$;

-- Index for media type filtering (only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'torrent_files' AND column_name = 'media_type') THEN
    CREATE INDEX IF NOT EXISTS idx_torrent_files_media_type ON torrent_files(media_type);
  END IF;
END $$;

-- Full-text search index on file path and name
CREATE INDEX IF NOT EXISTS idx_torrent_files_path_search ON torrent_files USING gin(to_tsvector('english', path || ' ' || name));

-- Composite index for efficient file listing (only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'torrent_files' AND column_name = 'file_index') THEN
    CREATE INDEX IF NOT EXISTS idx_torrent_files_torrent_index ON torrent_files(torrent_id, file_index);
  END IF;
END $$;

-- ============================================================================
-- File Search Function
-- Optimized search across torrent files with pagination
-- ============================================================================

CREATE OR REPLACE FUNCTION search_torrent_files(
  search_query TEXT,
  p_media_type VARCHAR(20) DEFAULT NULL,
  p_torrent_id UUID DEFAULT NULL,
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
) AS $$
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
  FROM torrent_files tf
  JOIN torrents t ON tf.torrent_id = t.id
  WHERE 
    t.status = 'ready'
    AND (search_query IS NULL OR search_query = '' OR 
         to_tsvector('english', tf.path || ' ' || tf.name) @@ plainto_tsquery('english', search_query))
    AND (p_media_type IS NULL OR tf.media_type = p_media_type)
    AND (p_torrent_id IS NULL OR tf.torrent_id = p_torrent_id)
  ORDER BY rank DESC, tf.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Torrent Search Function
-- Search torrents by name
-- ============================================================================

CREATE OR REPLACE FUNCTION search_torrents(
  search_query TEXT,
  p_status VARCHAR(20) DEFAULT 'ready',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  torrent_id UUID,
  torrent_name TEXT,
  torrent_infohash VARCHAR(40),
  torrent_size BIGINT,
  torrent_file_count INTEGER,
  torrent_status VARCHAR(20),
  torrent_created_at TIMESTAMPTZ,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id AS torrent_id,
    t.name AS torrent_name,
    t.infohash AS torrent_infohash,
    t.total_size AS torrent_size,
    t.file_count AS torrent_file_count,
    t.status AS torrent_status,
    t.created_at AS torrent_created_at,
    ts_rank(to_tsvector('english', t.name), plainto_tsquery('english', search_query)) AS rank
  FROM torrents t
  WHERE 
    (p_status IS NULL OR t.status = p_status)
    AND (search_query IS NULL OR search_query = '' OR 
         to_tsvector('english', t.name) @@ plainto_tsquery('english', search_query))
  ORDER BY rank DESC, t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Updated At Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_torrents_updated_at ON torrents;
CREATE TRIGGER update_torrents_updated_at
  BEFORE UPDATE ON torrents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE torrents ENABLE ROW LEVEL SECURITY;
ALTER TABLE torrent_files ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read ready torrents" ON torrents;
DROP POLICY IF EXISTS "Users can read own torrents" ON torrents;
DROP POLICY IF EXISTS "Authenticated users can insert torrents" ON torrents;
DROP POLICY IF EXISTS "Users can update own torrents" ON torrents;
DROP POLICY IF EXISTS "Users can delete own torrents" ON torrents;
DROP POLICY IF EXISTS "Anyone can read files from ready torrents" ON torrent_files;
DROP POLICY IF EXISTS "Service role can manage files" ON torrent_files;

-- Everyone can read ready torrents
CREATE POLICY "Anyone can read ready torrents"
  ON torrents FOR SELECT
  USING (status = 'ready');

-- Users can read their own torrents regardless of status
CREATE POLICY "Users can read own torrents"
  ON torrents FOR SELECT
  USING (auth.uid() = created_by);

-- Authenticated users can insert torrents
CREATE POLICY "Authenticated users can insert torrents"
  ON torrents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own torrents
CREATE POLICY "Users can update own torrents"
  ON torrents FOR UPDATE
  USING (auth.uid() = created_by);

-- Users can delete their own torrents
CREATE POLICY "Users can delete own torrents"
  ON torrents FOR DELETE
  USING (auth.uid() = created_by);

-- Everyone can read files from ready torrents
CREATE POLICY "Anyone can read files from ready torrents"
  ON torrent_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM torrents t 
      WHERE t.id = torrent_files.torrent_id 
      AND t.status = 'ready'
    )
  );

-- Service role can manage all files (for indexing)
CREATE POLICY "Service role can manage files"
  ON torrent_files FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Statistics View
-- ============================================================================

CREATE OR REPLACE VIEW torrent_stats AS
SELECT 
  COUNT(*) AS total_torrents,
  COUNT(*) FILTER (WHERE status = 'ready') AS ready_torrents,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_torrents,
  COUNT(*) FILTER (WHERE status = 'indexing') AS indexing_torrents,
  COUNT(*) FILTER (WHERE status = 'error') AS error_torrents,
  SUM(total_size) AS total_size_bytes,
  SUM(file_count) AS total_files
FROM torrents;

-- Grant access to the stats view
GRANT SELECT ON torrent_stats TO authenticated;
GRANT SELECT ON torrent_stats TO anon;
