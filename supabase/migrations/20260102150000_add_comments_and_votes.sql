-- Comments and Votes Migration
-- Adds support for torrent comments and voting (upvote/downvote) on both torrents and comments

-- ============================================
-- TORRENT COMMENTS TABLE
-- ============================================
CREATE TABLE torrent_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torrent_id UUID REFERENCES torrents(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    -- For nested comments (replies)
    parent_id UUID REFERENCES torrent_comments(id) ON DELETE CASCADE,
    -- Denormalized vote counts for performance
    upvotes INTEGER DEFAULT 0 NOT NULL,
    downvotes INTEGER DEFAULT 0 NOT NULL,
    -- Soft delete support
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Constraint: content must not be empty
    CONSTRAINT content_not_empty CHECK (length(trim(content)) > 0)
);

-- Indexes for torrent_comments
CREATE INDEX idx_torrent_comments_torrent_id ON torrent_comments(torrent_id);
CREATE INDEX idx_torrent_comments_user_id ON torrent_comments(user_id);
CREATE INDEX idx_torrent_comments_parent_id ON torrent_comments(parent_id);
CREATE INDEX idx_torrent_comments_created_at ON torrent_comments(created_at DESC);

-- ============================================
-- COMMENT VOTES TABLE
-- ============================================
CREATE TABLE comment_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID REFERENCES torrent_comments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    -- 1 for upvote, -1 for downvote
    vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- One vote per user per comment
    UNIQUE(comment_id, user_id)
);

-- Indexes for comment_votes
CREATE INDEX idx_comment_votes_comment_id ON comment_votes(comment_id);
CREATE INDEX idx_comment_votes_user_id ON comment_votes(user_id);

-- ============================================
-- TORRENT VOTES TABLE
-- ============================================
CREATE TABLE torrent_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torrent_id UUID REFERENCES torrents(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    -- 1 for upvote, -1 for downvote
    vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- One vote per user per torrent
    UNIQUE(torrent_id, user_id)
);

-- Indexes for torrent_votes
CREATE INDEX idx_torrent_votes_torrent_id ON torrent_votes(torrent_id);
CREATE INDEX idx_torrent_votes_user_id ON torrent_votes(user_id);

-- ============================================
-- ADD VOTE COUNTS TO TORRENTS TABLE
-- ============================================
ALTER TABLE torrents 
ADD COLUMN upvotes INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN downvotes INTEGER DEFAULT 0 NOT NULL;

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

-- Trigger for torrent_comments updated_at
CREATE TRIGGER update_torrent_comments_updated_at
    BEFORE UPDATE ON torrent_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for comment_votes updated_at
CREATE TRIGGER update_comment_votes_updated_at
    BEFORE UPDATE ON comment_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for torrent_votes updated_at
CREATE TRIGGER update_torrent_votes_updated_at
    BEFORE UPDATE ON torrent_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTIONS FOR VOTE COUNT MANAGEMENT
-- ============================================

-- Function to update comment vote counts
CREATE OR REPLACE FUNCTION update_comment_vote_counts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE torrent_comments
        SET 
            upvotes = upvotes + CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes + CASE WHEN NEW.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE torrent_comments
        SET 
            upvotes = upvotes 
                - CASE WHEN OLD.vote_value = 1 THEN 1 ELSE 0 END
                + CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes 
                - CASE WHEN OLD.vote_value = -1 THEN 1 ELSE 0 END
                + CASE WHEN NEW.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE torrent_comments
        SET 
            upvotes = upvotes - CASE WHEN OLD.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes - CASE WHEN OLD.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to update torrent vote counts
CREATE OR REPLACE FUNCTION update_torrent_vote_counts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE torrents
        SET 
            upvotes = upvotes + CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes + CASE WHEN NEW.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = NEW.torrent_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE torrents
        SET 
            upvotes = upvotes 
                - CASE WHEN OLD.vote_value = 1 THEN 1 ELSE 0 END
                + CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes 
                - CASE WHEN OLD.vote_value = -1 THEN 1 ELSE 0 END
                + CASE WHEN NEW.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = NEW.torrent_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE torrents
        SET 
            upvotes = upvotes - CASE WHEN OLD.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes - CASE WHEN OLD.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = OLD.torrent_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update vote counts
CREATE TRIGGER trigger_update_comment_vote_counts
    AFTER INSERT OR UPDATE OR DELETE ON comment_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_comment_vote_counts();

CREATE TRIGGER trigger_update_torrent_vote_counts
    AFTER INSERT OR UPDATE OR DELETE ON torrent_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_torrent_vote_counts();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE torrent_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE torrent_votes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TORRENT COMMENTS POLICIES
-- ============================================

-- Comments are publicly readable (even deleted ones are hidden via WHERE clause in queries)
CREATE POLICY "Comments are publicly readable"
    ON torrent_comments FOR SELECT
    USING (true);

-- Authenticated users can insert comments
CREATE POLICY "Authenticated users can insert comments"
    ON torrent_comments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update their own comments"
    ON torrent_comments FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete (soft delete) their own comments
CREATE POLICY "Users can delete their own comments"
    ON torrent_comments FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all comments
CREATE POLICY "Service role can manage comments"
    ON torrent_comments FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- COMMENT VOTES POLICIES
-- ============================================

-- Comment votes are publicly readable (to show vote counts)
CREATE POLICY "Comment votes are publicly readable"
    ON comment_votes FOR SELECT
    USING (true);

-- Authenticated users can insert their votes
CREATE POLICY "Authenticated users can insert comment votes"
    ON comment_votes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own votes
CREATE POLICY "Users can update their own comment votes"
    ON comment_votes FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own votes
CREATE POLICY "Users can delete their own comment votes"
    ON comment_votes FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all comment votes
CREATE POLICY "Service role can manage comment votes"
    ON comment_votes FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- TORRENT VOTES POLICIES
-- ============================================

-- Torrent votes are publicly readable
CREATE POLICY "Torrent votes are publicly readable"
    ON torrent_votes FOR SELECT
    USING (true);

-- Authenticated users can insert their votes
CREATE POLICY "Authenticated users can insert torrent votes"
    ON torrent_votes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own votes
CREATE POLICY "Users can update their own torrent votes"
    ON torrent_votes FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own votes
CREATE POLICY "Users can delete their own torrent votes"
    ON torrent_votes FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all torrent votes
CREATE POLICY "Service role can manage torrent votes"
    ON torrent_votes FOR ALL
    USING (auth.role() = 'service_role');
