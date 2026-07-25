-- Derive bt_torrent_comments.infohash from torrent_id when a writer omits it.
--
-- The previous migration made infohash NOT NULL. Any writer that predates it —
-- including a deployed bundle that hasn't rolled over yet — inserts only
-- torrent_id and would otherwise fail outright. This trigger fills the gap and
-- guarantees the two columns can never disagree.

CREATE OR REPLACE FUNCTION bt_torrent_comments_fill_infohash()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.infohash IS NULL AND NEW.torrent_id IS NOT NULL THEN
        SELECT lower(t.infohash) INTO NEW.infohash
        FROM bt_torrents t
        WHERE t.id = NEW.torrent_id;
    ELSIF NEW.infohash IS NOT NULL THEN
        NEW.infohash := lower(NEW.infohash);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bt_torrent_comments_fill_infohash ON bt_torrent_comments;
CREATE TRIGGER trigger_bt_torrent_comments_fill_infohash
    BEFORE INSERT OR UPDATE ON bt_torrent_comments
    FOR EACH ROW
    EXECUTE FUNCTION bt_torrent_comments_fill_infohash();
