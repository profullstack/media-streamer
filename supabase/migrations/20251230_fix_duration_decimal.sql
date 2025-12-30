-- Fix duration_seconds columns to accept decimal values
-- FFprobe returns duration as decimal (e.g., 7590.03) not integer

-- Change video_metadata.duration_seconds from INTEGER to DECIMAL(12,3)
-- This allows for millisecond precision while supporting videos up to ~31 years
ALTER TABLE video_metadata
ALTER COLUMN duration_seconds TYPE DECIMAL(12,3)
USING duration_seconds::DECIMAL(12,3);

-- Change audio_metadata.duration_seconds from INTEGER to DECIMAL(12,3)
ALTER TABLE audio_metadata
ALTER COLUMN duration_seconds TYPE DECIMAL(12,3)
USING duration_seconds::DECIMAL(12,3);

-- Change watch_progress.duration_seconds from INTEGER to DECIMAL(12,3)
ALTER TABLE watch_progress
ALTER COLUMN duration_seconds TYPE DECIMAL(12,3)
USING duration_seconds::DECIMAL(12,3);

-- Change watch_progress.current_time_seconds from INTEGER to DECIMAL(12,3)
ALTER TABLE watch_progress
ALTER COLUMN current_time_seconds TYPE DECIMAL(12,3)
USING current_time_seconds::DECIMAL(12,3);

-- Add comments for documentation
COMMENT ON COLUMN video_metadata.duration_seconds IS 'Duration in seconds with millisecond precision (e.g., 7590.03)';
COMMENT ON COLUMN audio_metadata.duration_seconds IS 'Duration in seconds with millisecond precision (e.g., 180.456)';
COMMENT ON COLUMN watch_progress.duration_seconds IS 'Total duration in seconds with millisecond precision';
COMMENT ON COLUMN watch_progress.current_time_seconds IS 'Current playback position in seconds with millisecond precision';
