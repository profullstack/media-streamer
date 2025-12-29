-- Migration: Add codec information columns to video_metadata and audio_metadata
-- This enables storing detailed codec info for transcoding decisions

-- Add audio_codec column to video_metadata (for video files with audio tracks)
ALTER TABLE video_metadata 
ADD COLUMN IF NOT EXISTS audio_codec VARCHAR(50),
ADD COLUMN IF NOT EXISTS container VARCHAR(50),
ADD COLUMN IF NOT EXISTS needs_transcoding BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS codec_detected_at TIMESTAMPTZ;

-- Add codec columns to audio_metadata
ALTER TABLE audio_metadata
ADD COLUMN IF NOT EXISTS codec VARCHAR(50),
ADD COLUMN IF NOT EXISTS container VARCHAR(50),
ADD COLUMN IF NOT EXISTS needs_transcoding BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS codec_detected_at TIMESTAMPTZ;

-- Create indexes for efficient queries on transcoding needs
CREATE INDEX IF NOT EXISTS idx_video_metadata_needs_transcoding 
ON video_metadata(needs_transcoding) WHERE needs_transcoding = TRUE;

CREATE INDEX IF NOT EXISTS idx_audio_metadata_needs_transcoding 
ON audio_metadata(needs_transcoding) WHERE needs_transcoding = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN video_metadata.audio_codec IS 'Audio codec used in the video file (e.g., aac, ac3, dts)';
COMMENT ON COLUMN video_metadata.container IS 'Container format (e.g., mp4, mkv, avi)';
COMMENT ON COLUMN video_metadata.needs_transcoding IS 'Whether the file needs transcoding for browser playback';
COMMENT ON COLUMN video_metadata.codec_detected_at IS 'When the codec was detected via FFprobe';

COMMENT ON COLUMN audio_metadata.codec IS 'Audio codec (e.g., mp3, aac, flac)';
COMMENT ON COLUMN audio_metadata.container IS 'Container format (e.g., mp3, m4a, flac)';
COMMENT ON COLUMN audio_metadata.needs_transcoding IS 'Whether the file needs transcoding for browser playback';
COMMENT ON COLUMN audio_metadata.codec_detected_at IS 'When the codec was detected via FFprobe';
