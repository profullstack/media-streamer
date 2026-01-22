-- Radio Station Favorites
-- Stores user's favorite radio stations from TuneIn

-- Create radio_station_favorites table
CREATE TABLE IF NOT EXISTS public.radio_station_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL,              -- TuneIn GuideId (e.g., "s123456")
    station_name TEXT NOT NULL,            -- Station title
    station_image_url TEXT,                -- Station logo/image
    station_genre TEXT,                    -- Station genre/category
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each user can only favorite a station once
    CONSTRAINT radio_station_favorites_user_station_unique UNIQUE(user_id, station_id)
);

-- Create index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_radio_station_favorites_user_id
    ON public.radio_station_favorites(user_id);

-- Create index for station lookup (for stats/analytics)
CREATE INDEX IF NOT EXISTS idx_radio_station_favorites_station_id
    ON public.radio_station_favorites(station_id);

-- Enable Row Level Security
ALTER TABLE public.radio_station_favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own favorites
CREATE POLICY "Users can view own radio favorites"
    ON public.radio_station_favorites
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own favorites
CREATE POLICY "Users can insert own radio favorites"
    ON public.radio_station_favorites
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own favorites
CREATE POLICY "Users can delete own radio favorites"
    ON public.radio_station_favorites
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.radio_station_favorites TO authenticated;

-- Comment on table
COMMENT ON TABLE public.radio_station_favorites IS 'Stores user favorite radio stations from TuneIn';
COMMENT ON COLUMN public.radio_station_favorites.station_id IS 'TuneIn GuideId identifier for the station';
COMMENT ON COLUMN public.radio_station_favorites.station_name IS 'Display name of the radio station';
COMMENT ON COLUMN public.radio_station_favorites.station_image_url IS 'URL to station logo/image';
COMMENT ON COLUMN public.radio_station_favorites.station_genre IS 'Genre/category of the station';
