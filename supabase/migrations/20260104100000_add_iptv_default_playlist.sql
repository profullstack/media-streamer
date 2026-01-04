-- Add is_default column to iptv_playlists
-- Allows users to set a default provider that auto-selects when visiting /live-tv

-- Add is_default column
ALTER TABLE iptv_playlists ADD COLUMN is_default BOOLEAN DEFAULT false;

-- Create index for efficient default lookup
CREATE INDEX idx_iptv_playlists_user_default ON iptv_playlists(user_id, is_default) WHERE is_default = true;

-- Function to ensure only one default playlist per user
-- When setting a playlist as default, unset all others for that user
CREATE OR REPLACE FUNCTION ensure_single_default_iptv_playlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If setting this playlist as default, unset all others for this user
    IF NEW.is_default = true THEN
        UPDATE iptv_playlists
        SET is_default = false
        WHERE user_id = NEW.user_id
          AND id != NEW.id
          AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger to enforce single default per user
CREATE TRIGGER enforce_single_default_iptv_playlist
    BEFORE INSERT OR UPDATE OF is_default ON iptv_playlists
    FOR EACH ROW
    WHEN (NEW.is_default = true)
    EXECUTE FUNCTION ensure_single_default_iptv_playlist();
