-- Add profile_id to missing user-scoped tables
-- Complementary migration to 20260220000000_add_profiles.sql

-- ============================================
-- ADD PROFILE_ID TO MISSING TABLES
-- ============================================

-- Add profile_id to user_favorites
ALTER TABLE user_favorites ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_user_favorites_profile_id ON user_favorites(profile_id);

-- Add profile_id to collections  
ALTER TABLE collections ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_collections_profile_id ON collections(profile_id);

-- Add profile_id to user_watchlists (the correct table name)
ALTER TABLE user_watchlists ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_user_watchlists_profile_id ON user_watchlists(profile_id);

-- ============================================
-- MIGRATE EXISTING DATA TO USE DEFAULT PROFILES
-- ============================================

-- Update user_favorites to use default profile for each user
UPDATE user_favorites uf
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = uf.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE uf.profile_id IS NULL;

-- Update collections to use default profile for each user
UPDATE collections c
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = c.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE c.profile_id IS NULL;

-- Update user_watchlists to use default profile for each user
UPDATE user_watchlists uw
SET profile_id = (
    SELECT p.id FROM profiles p 
    WHERE p.account_id = uw.user_id 
    AND p.is_default = true 
    LIMIT 1
)
WHERE uw.profile_id IS NULL;

-- ============================================
-- UPDATE UNIQUE CONSTRAINTS
-- ============================================

-- Update user_favorites unique constraint to use profile_id instead of user_id
ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_user_id_file_id_key;
ALTER TABLE user_favorites ADD CONSTRAINT unique_profile_user_favorite UNIQUE(profile_id, file_id);

-- Update collections unique constraint to use profile_id instead of user_id  
ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_user_id_name_key;
ALTER TABLE collections ADD CONSTRAINT unique_profile_collection_name UNIQUE(profile_id, name);

-- Note: user_watchlists doesn't have a name uniqueness constraint, so no update needed