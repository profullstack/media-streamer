-- IMDB dataset tables
-- Data imported separately via scripts/import-imdb.sh

-- Drop if re-running migration
DROP TABLE IF EXISTS imdb_title_principals CASCADE;
DROP TABLE IF EXISTS imdb_title_akas CASCADE;
DROP TABLE IF EXISTS imdb_title_episode CASCADE;
DROP TABLE IF EXISTS imdb_title_crew CASCADE;
DROP TABLE IF EXISTS imdb_title_ratings CASCADE;
DROP TABLE IF EXISTS imdb_name_basics CASCADE;
DROP TABLE IF EXISTS imdb_title_basics CASCADE;

CREATE TABLE imdb_title_basics (
    tconst TEXT PRIMARY KEY,
    title_type TEXT,
    primary_title TEXT,
    original_title TEXT,
    is_adult BOOLEAN,
    start_year INTEGER,
    end_year INTEGER,
    runtime_minutes INTEGER,
    genres TEXT
);

CREATE TABLE imdb_title_ratings (
    tconst TEXT PRIMARY KEY,
    average_rating NUMERIC(3,1),
    num_votes INTEGER
);

CREATE TABLE imdb_title_crew (
    tconst TEXT PRIMARY KEY,
    directors TEXT,
    writers TEXT
);

CREATE TABLE imdb_title_episode (
    tconst TEXT PRIMARY KEY,
    parent_tconst TEXT,
    season_number INTEGER,
    episode_number INTEGER
);

CREATE TABLE imdb_name_basics (
    nconst TEXT PRIMARY KEY,
    primary_name TEXT,
    birth_year INTEGER,
    death_year INTEGER,
    primary_profession TEXT,
    known_for_titles TEXT
);

CREATE TABLE imdb_title_akas (
    title_id TEXT,
    ordering INTEGER,
    title TEXT,
    region TEXT,
    language TEXT,
    types TEXT,
    attributes TEXT,
    is_original_title BOOLEAN,
    PRIMARY KEY (title_id, ordering)
);

CREATE TABLE imdb_title_principals (
    tconst TEXT,
    ordering INTEGER,
    nconst TEXT,
    category TEXT,
    job TEXT,
    characters TEXT,
    PRIMARY KEY (tconst, ordering)
);

-- Indexes
CREATE INDEX idx_imdb_title_basics_primary_title ON imdb_title_basics USING gin (to_tsvector('english', primary_title));
CREATE INDEX idx_imdb_title_basics_start_year ON imdb_title_basics (start_year);
CREATE INDEX idx_imdb_title_basics_title_type ON imdb_title_basics (title_type);
CREATE INDEX idx_imdb_title_ratings_avg ON imdb_title_ratings (average_rating);
CREATE INDEX idx_imdb_title_ratings_votes ON imdb_title_ratings (num_votes);
CREATE INDEX idx_imdb_title_principals_nconst ON imdb_title_principals (nconst);
CREATE INDEX idx_imdb_title_principals_tconst ON imdb_title_principals (tconst);
CREATE INDEX idx_imdb_title_episode_parent ON imdb_title_episode (parent_tconst);
CREATE INDEX idx_imdb_name_basics_name ON imdb_name_basics (primary_name);
CREATE INDEX idx_imdb_title_akas_title ON imdb_title_akas (title);
