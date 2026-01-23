-- Data Migration: Copy existing user torrents to bt_ tables
-- This migration handles the case where data exists in the old "torrents" table
-- and needs to be migrated to the new "bt_torrents" namespace

-- ============================================
-- MIGRATE TORRENTS DATA
-- ============================================
-- Only migrate if the old torrents table exists with UUID id column (app's schema)
-- Bitmagnet's torrents table uses bytea info_hash as PK, not UUID id

DO $$
DECLARE
    old_table_has_uuid_id BOOLEAN;
    rows_migrated INTEGER;
BEGIN
    -- Check if torrents table exists with UUID id column (app schema, not Bitmagnet)
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'torrents'
        AND column_name = 'id'
        AND data_type = 'uuid'
    ) INTO old_table_has_uuid_id;

    IF old_table_has_uuid_id THEN
        RAISE NOTICE 'Found old torrents table with UUID id - migrating data...';

        -- Migrate torrents - handle column differences safely
        INSERT INTO bt_torrents (
            id,
            infohash,
            magnet_uri,
            name,
            total_size,
            file_count,
            piece_length,
            status,
            error_message,
            indexed_at,
            clean_title,
            poster_url,
            cover_url,
            content_type,
            year,
            description,
            external_id,
            external_source,
            metadata_fetched_at,
            director,
            actors,
            genre,
            artist,
            album,
            artist_image_url,
            album_cover_url,
            seeders,
            leechers,
            swarm_updated_at,
            upvotes,
            downvotes,
            video_codec,
            audio_codec,
            container,
            needs_transcoding,
            created_by,
            created_at,
            updated_at
        )
        SELECT
            t.id,
            t.infohash,
            t.magnet_uri,
            t.name,
            COALESCE(t.total_size, 0),
            COALESCE(t.file_count, 0),
            t.piece_length,
            COALESCE(t.status, 'ready'),
            t.error_message,
            t.indexed_at,
            t.clean_title,
            t.poster_url,
            t.cover_url,
            t.content_type,
            t.year,
            t.description,
            t.external_id,
            t.external_source,
            t.metadata_fetched_at,
            t.director,
            t.actors,
            t.genre,
            t.artist,
            t.album,
            t.artist_image_url,
            t.album_cover_url,
            COALESCE(t.seeders, 0),
            COALESCE(t.leechers, 0),
            t.swarm_updated_at,
            COALESCE(t.upvotes, 0),
            COALESCE(t.downvotes, 0),
            t.video_codec,
            t.audio_codec,
            t.container,
            COALESCE(t.needs_transcoding, false),
            t.created_by,
            t.created_at,
            COALESCE(t.updated_at, t.created_at)
        FROM torrents t
        WHERE NOT EXISTS (
            SELECT 1 FROM bt_torrents bt WHERE bt.id = t.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM bt_torrents bt WHERE bt.infohash = t.infohash
        );

        GET DIAGNOSTICS rows_migrated = ROW_COUNT;
        RAISE NOTICE 'Migrated % torrents to bt_torrents', rows_migrated;
    ELSE
        RAISE NOTICE 'No old torrents table with UUID id found - skipping torrent migration';
    END IF;
END $$;

-- ============================================
-- MIGRATE TORRENT_FILES DATA
-- ============================================
DO $$
DECLARE
    rows_migrated INTEGER;
BEGIN
    -- Check if torrent_files table exists with proper structure
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'torrent_files'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'torrent_files' AND column_name = 'torrent_id'
    ) THEN
        RAISE NOTICE 'Migrating torrent_files...';

        INSERT INTO bt_torrent_files (
            id,
            torrent_id,
            file_index,
            path,
            name,
            extension,
            size,
            piece_start,
            piece_end,
            media_category,
            mime_type,
            created_at
        )
        SELECT
            tf.id,
            tf.torrent_id,
            tf.file_index,
            tf.path,
            tf.name,
            tf.extension,
            tf.size,
            tf.piece_start,
            tf.piece_end,
            tf.media_category,
            tf.mime_type,
            tf.created_at
        FROM torrent_files tf
        WHERE EXISTS (
            SELECT 1 FROM bt_torrents bt WHERE bt.id = tf.torrent_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM bt_torrent_files btf WHERE btf.id = tf.id
        );

        GET DIAGNOSTICS rows_migrated = ROW_COUNT;
        RAISE NOTICE 'Migrated % files to bt_torrent_files', rows_migrated;
    ELSE
        RAISE NOTICE 'No torrent_files table found - skipping file migration';
    END IF;
END $$;

-- ============================================
-- MIGRATE TORRENT_FOLDERS DATA
-- ============================================
DO $$
DECLARE
    rows_migrated INTEGER;
    has_file_count BOOLEAN;
    has_total_size BOOLEAN;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'torrent_folders'
    ) THEN
        -- Check which columns exist
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'torrent_folders' AND column_name = 'file_count'
        ) INTO has_file_count;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'torrent_folders' AND column_name = 'total_size'
        ) INTO has_total_size;

        RAISE NOTICE 'Migrating torrent_folders (has_file_count=%, has_total_size=%)...', has_file_count, has_total_size;

        -- Only migrate folders that have a corresponding bt_torrent
        -- Use minimal columns that are guaranteed to exist
        INSERT INTO bt_torrent_folders (
            id,
            torrent_id,
            path,
            artist,
            album,
            year,
            cover_url,
            created_at
        )
        SELECT
            tf.id,
            tf.torrent_id,
            tf.path,
            tf.artist,
            tf.album,
            tf.year,
            tf.cover_url,
            tf.created_at
        FROM torrent_folders tf
        WHERE EXISTS (
            SELECT 1 FROM bt_torrents bt WHERE bt.id = tf.torrent_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM bt_torrent_folders btf WHERE btf.id = tf.id
        );

        GET DIAGNOSTICS rows_migrated = ROW_COUNT;
        RAISE NOTICE 'Migrated % folders to bt_torrent_folders', rows_migrated;
    ELSE
        RAISE NOTICE 'No torrent_folders table found - skipping folder migration';
    END IF;
END $$;

-- ============================================
-- MIGRATE AUDIO_METADATA DATA
-- ============================================
DO $$
DECLARE
    rows_migrated INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'audio_metadata'
    ) THEN
        RAISE NOTICE 'Migrating audio_metadata...';

        INSERT INTO bt_audio_metadata (
            id,
            file_id,
            artist,
            album,
            title,
            track_number,
            duration_seconds,
            bitrate,
            sample_rate,
            codec,
            container,
            genre,
            year,
            created_at
        )
        SELECT
            am.id,
            am.file_id,
            am.artist,
            am.album,
            am.title,
            am.track_number,
            am.duration_seconds,
            am.bitrate,
            am.sample_rate,
            am.codec,
            am.container,
            am.genre,
            am.year,
            am.created_at
        FROM audio_metadata am
        WHERE EXISTS (
            SELECT 1 FROM bt_torrent_files btf WHERE btf.id = am.file_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM bt_audio_metadata bam WHERE bam.id = am.id
        );

        GET DIAGNOSTICS rows_migrated = ROW_COUNT;
        RAISE NOTICE 'Migrated % audio metadata records', rows_migrated;
    ELSE
        RAISE NOTICE 'No audio_metadata table found - skipping';
    END IF;
END $$;

-- ============================================
-- MIGRATE VIDEO_METADATA DATA
-- ============================================
DO $$
DECLARE
    rows_migrated INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'video_metadata'
    ) THEN
        RAISE NOTICE 'Migrating video_metadata...';

        INSERT INTO bt_video_metadata (
            id,
            file_id,
            title,
            duration_seconds,
            width,
            height,
            codec,
            audio_codec,
            container,
            bitrate,
            framerate,
            needs_transcoding,
            created_at
        )
        SELECT
            vm.id,
            vm.file_id,
            vm.title,
            vm.duration_seconds,
            vm.width,
            vm.height,
            vm.codec,
            vm.audio_codec,
            vm.container,
            vm.bitrate,
            vm.framerate,
            COALESCE(vm.needs_transcoding, false),
            vm.created_at
        FROM video_metadata vm
        WHERE EXISTS (
            SELECT 1 FROM bt_torrent_files btf WHERE btf.id = vm.file_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM bt_video_metadata bvm WHERE bvm.id = vm.id
        );

        GET DIAGNOSTICS rows_migrated = ROW_COUNT;
        RAISE NOTICE 'Migrated % video metadata records', rows_migrated;
    ELSE
        RAISE NOTICE 'No video_metadata table found - skipping';
    END IF;
END $$;

-- ============================================
-- MIGRATE EBOOK_METADATA DATA
-- ============================================
DO $$
DECLARE
    rows_migrated INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'ebook_metadata'
    ) THEN
        RAISE NOTICE 'Migrating ebook_metadata...';

        INSERT INTO bt_ebook_metadata (
            id,
            file_id,
            title,
            author,
            publisher,
            isbn,
            language,
            page_count,
            year,
            created_at
        )
        SELECT
            em.id,
            em.file_id,
            em.title,
            em.author,
            em.publisher,
            em.isbn,
            em.language,
            em.page_count,
            em.year,
            em.created_at
        FROM ebook_metadata em
        WHERE EXISTS (
            SELECT 1 FROM bt_torrent_files btf WHERE btf.id = em.file_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM bt_ebook_metadata bem WHERE bem.id = em.id
        );

        GET DIAGNOSTICS rows_migrated = ROW_COUNT;
        RAISE NOTICE 'Migrated % ebook metadata records', rows_migrated;
    ELSE
        RAISE NOTICE 'No ebook_metadata table found - skipping';
    END IF;
END $$;

-- ============================================
-- FIX FOREIGN KEYS FOR COMMENTS/VOTES/FAVORITES
-- (Re-link to bt_torrents for migrated data)
-- ============================================

-- The previous migration already updated these FK constraints
-- Just verify the data integrity here
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    -- Check for orphaned comments
    SELECT COUNT(*) INTO orphan_count
    FROM torrent_comments tc
    WHERE NOT EXISTS (SELECT 1 FROM bt_torrents bt WHERE bt.id = tc.torrent_id);

    IF orphan_count > 0 THEN
        RAISE NOTICE 'Found % orphaned comments (will be inaccessible until their torrents are migrated)', orphan_count;
    END IF;

    -- Check for orphaned votes
    SELECT COUNT(*) INTO orphan_count
    FROM torrent_votes tv
    WHERE NOT EXISTS (SELECT 1 FROM bt_torrents bt WHERE bt.id = tv.torrent_id);

    IF orphan_count > 0 THEN
        RAISE NOTICE 'Found % orphaned votes (will be inaccessible until their torrents are migrated)', orphan_count;
    END IF;

    -- Check for orphaned favorites
    SELECT COUNT(*) INTO orphan_count
    FROM torrent_favorites tf
    WHERE NOT EXISTS (SELECT 1 FROM bt_torrents bt WHERE bt.id = tf.torrent_id);

    IF orphan_count > 0 THEN
        RAISE NOTICE 'Found % orphaned favorites (will be inaccessible until their torrents are migrated)', orphan_count;
    END IF;
END $$;

-- Report final counts
DO $$
DECLARE
    torrent_count INTEGER;
    file_count INTEGER;
    folder_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO torrent_count FROM bt_torrents;
    SELECT COUNT(*) INTO file_count FROM bt_torrent_files;
    SELECT COUNT(*) INTO folder_count FROM bt_torrent_folders;

    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'bt_torrents: % records', torrent_count;
    RAISE NOTICE 'bt_torrent_files: % records', file_count;
    RAISE NOTICE 'bt_torrent_folders: % records', folder_count;
END $$;
