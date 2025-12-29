-- Add torrent-level codec fields for collections
-- These represent the codec of the first/representative file in the torrent
-- For collections, all files typically use the same encoding

ALTER TABLE torrents
ADD COLUMN IF NOT EXISTS video_codec TEXT,
ADD COLUMN IF NOT EXISTS audio_codec TEXT,
ADD COLUMN IF NOT EXISTS container TEXT,
ADD COLUMN IF NOT EXISTS needs_transcoding BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS codec_detected_at TIMESTAMPTZ;

-- Add index for filtering by transcoding needs
CREATE INDEX IF NOT EXISTS idx_torrents_needs_transcoding 
ON torrents(needs_transcoding) 
WHERE needs_transcoding = TRUE;

-- Add comment explaining the fields
COMMENT ON COLUMN torrents.video_codec IS 'Video codec of representative file (e.g., h264, hevc, vp9)';
COMMENT ON COLUMN torrents.audio_codec IS 'Audio codec of representative file (e.g., aac, mp3, flac)';
COMMENT ON COLUMN torrents.container IS 'Container format of representative file (e.g., mp4, mkv, webm)';
COMMENT ON COLUMN torrents.needs_transcoding IS 'Whether the torrent files need transcoding for browser playback';
COMMENT ON COLUMN torrents.codec_detected_at IS 'When codec detection was performed';
