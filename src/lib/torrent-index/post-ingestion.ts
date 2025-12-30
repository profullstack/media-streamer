/**
 * Post-Ingestion Service
 *
 * Handles automatic metadata enrichment and codec detection after magnet URL ingestion.
 * This service is called after a new torrent is successfully ingested
 * to fetch metadata from external APIs (OMDb, MusicBrainz, Open Library, etc.)
 * and detect codec information for media files.
 *
 * Server-side only module.
 */

import { createServerClient } from '@/lib/supabase';
import {
  enrichTorrentMetadata,
  detectContentType,
  type EnrichmentResult,
  type ContentType,
} from '@/lib/metadata-enrichment';
import { createLogger } from '@/lib/logger';

const logger = createLogger('PostIngestion');

// ============================================================================
// Types
// ============================================================================

export interface PostIngestionOptions {
  /** The torrent name for content detection and enrichment */
  torrentName: string;
  /** The infohash of the torrent */
  infohash: string;
  /** Whether this is a duplicate torrent (skip enrichment) */
  isDuplicate?: boolean;
}

export interface PostIngestionResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Whether enrichment was triggered */
  enrichmentTriggered: boolean;
  /** The detected content type */
  contentType?: ContentType;
  /** Reason for skipping enrichment */
  skippedReason?: 'duplicate' | 'content_type_excluded' | 'error';
  /** Error message if failed */
  error?: string;
  /** The enrichment result if successful */
  enrichment?: EnrichmentResult;
}

export interface CodecDetectionOptions {
  /** Maximum number of files to process for codec detection (default: 5) */
  maxFiles?: number;
}

export interface CodecDetectionResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Number of files processed for codec detection */
  filesProcessed: number;
  /** Reason for skipping codec detection */
  skippedReason?: 'no_media_files' | 'error';
  /** Error message if failed */
  error?: string;
  /** File IDs that were queued for codec detection */
  queuedFileIds?: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const MUSICBRAINZ_USER_AGENT = 'BitTorrented/1.0.0 (https://bittorrented.com)';

// Content types that should not be enriched
const EXCLUDED_CONTENT_TYPES: ContentType[] = ['xxx', 'other'];

// ============================================================================
// Post-Ingestion Functions
// ============================================================================

/**
 * Trigger metadata enrichment for a newly ingested torrent.
 *
 * This function:
 * 1. Detects the content type from the torrent name
 * 2. Skips enrichment for duplicates and excluded content types
 * 3. Fetches metadata from external APIs
 * 4. Updates the torrent record in the database
 *
 * @param torrentId - The ID of the torrent to enrich
 * @param options - Options including torrent name and duplicate status
 * @returns Result of the enrichment operation
 */
export async function triggerPostIngestionEnrichment(
  torrentId: string,
  options: PostIngestionOptions
): Promise<PostIngestionResult> {
  const { torrentName, infohash, isDuplicate } = options;

  logger.info('Starting post-ingestion enrichment', {
    torrentId,
    torrentName: torrentName.substring(0, 100),
    infohash,
    isDuplicate,
  });

  // Skip enrichment for duplicates
  if (isDuplicate) {
    logger.info('Skipping enrichment for duplicate torrent', { torrentId });
    return {
      success: true,
      enrichmentTriggered: false,
      skippedReason: 'duplicate',
    };
  }

  // Detect content type
  const contentType = detectContentType(torrentName);
  logger.info('Detected content type', { torrentId, contentType });

  // Skip enrichment for excluded content types
  if (EXCLUDED_CONTENT_TYPES.includes(contentType)) {
    logger.info('Skipping enrichment for excluded content type', {
      torrentId,
      contentType,
    });
    return {
      success: true,
      enrichmentTriggered: false,
      contentType,
      skippedReason: 'content_type_excluded',
    };
  }

  // Get API keys from environment
  const omdbApiKey = process.env.OMDB_API_KEY;
  const fanartTvApiKey = process.env.FANART_TV_API_KEY;

  try {
    // Enrich metadata
    const enrichment = await enrichTorrentMetadata(torrentName, {
      omdbApiKey,
      fanartTvApiKey,
      musicbrainzUserAgent: MUSICBRAINZ_USER_AGENT,
    });

    logger.info('Enrichment completed', {
      torrentId,
      contentType: enrichment.contentType,
      hasPoster: !!enrichment.posterUrl,
      hasCover: !!enrichment.coverUrl,
      hasExternalId: !!enrichment.externalId,
      error: enrichment.error,
    });

    // Update the database with enrichment results
    const updateResult = await updateTorrentWithEnrichment(torrentId, enrichment);

    if (!updateResult.success) {
      return {
        success: false,
        enrichmentTriggered: true,
        contentType: enrichment.contentType,
        error: updateResult.error,
        enrichment,
      };
    }

    return {
      success: true,
      enrichmentTriggered: true,
      contentType: enrichment.contentType,
      enrichment,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Enrichment failed', error instanceof Error ? error : undefined, {
      torrentId,
      error: errorMessage,
    });

    return {
      success: false,
      enrichmentTriggered: true,
      contentType,
      skippedReason: 'error',
      error: errorMessage,
    };
  }
}

/**
 * Update torrent record with enrichment results
 */
async function updateTorrentWithEnrichment(
  torrentId: string,
  enrichment: EnrichmentResult
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  // Build update data
  const updateData: Record<string, unknown> = {
    content_type: enrichment.contentType,
    metadata_fetched_at: new Date().toISOString(),
  };

  if (enrichment.posterUrl) {
    updateData.poster_url = enrichment.posterUrl;
  }
  if (enrichment.coverUrl) {
    updateData.cover_url = enrichment.coverUrl;
  }
  if (enrichment.externalId) {
    updateData.external_id = enrichment.externalId;
  }
  if (enrichment.externalSource) {
    updateData.external_source = enrichment.externalSource;
  }
  if (enrichment.year) {
    updateData.year = enrichment.year;
  }
  if (enrichment.description) {
    updateData.description = enrichment.description;
  }

  const { error } = await supabase
    .from('torrents')
    .update(updateData)
    .eq('id', torrentId);

  if (error) {
    logger.error('Failed to update torrent with enrichment', undefined, {
      torrentId,
      error: error.message,
    });
    return {
      success: false,
      error: `Database update failed: ${error.message}`,
    };
  }

  logger.info('Torrent updated with enrichment', { torrentId });
  return { success: true };
}

// ============================================================================
// Codec Detection Functions
// ============================================================================

/** Media categories that support codec detection */
const CODEC_DETECTABLE_CATEGORIES = ['video', 'audio'] as const;

/** Default maximum files to process for codec detection */
const DEFAULT_MAX_CODEC_FILES = 5;

/**
 * Trigger codec detection for media files in a torrent.
 *
 * This function:
 * 1. Fetches video/audio files from the torrent
 * 2. Queues them for codec detection via the codec-info API
 * 3. Returns the list of files that were queued
 *
 * Note: Codec detection is async and happens in the background.
 * The actual codec info will be stored when the detection completes.
 *
 * @param torrentId - The ID of the torrent
 * @param infohash - The infohash of the torrent
 * @param options - Options for codec detection
 * @returns Result of the codec detection operation
 */
export async function triggerCodecDetection(
  torrentId: string,
  infohash: string,
  options: CodecDetectionOptions = {}
): Promise<CodecDetectionResult> {
  const { maxFiles = DEFAULT_MAX_CODEC_FILES } = options;

  logger.info('Starting codec detection', {
    torrentId,
    infohash,
    maxFiles,
  });

  try {
    const supabase = createServerClient();

    // Fetch media files for this torrent
    const { data: files, error: filesError } = await supabase
      .from('torrent_files')
      .select('id, file_index, media_category, path')
      .eq('torrent_id', torrentId)
      .in('media_category', CODEC_DETECTABLE_CATEGORIES);

    if (filesError) {
      logger.error('Failed to fetch torrent files', undefined, {
        torrentId,
        error: filesError.message,
      });
      return {
        success: false,
        filesProcessed: 0,
        error: `Database error: ${filesError.message}`,
      };
    }

    if (!files || files.length === 0) {
      logger.info('No media files found for codec detection', { torrentId });
      return {
        success: true,
        filesProcessed: 0,
        skippedReason: 'no_media_files',
      };
    }

    // Limit the number of files to process
    const filesToProcess = files.slice(0, maxFiles);
    const queuedFileIds: string[] = [];

    logger.info('Queueing files for codec detection', {
      torrentId,
      totalFiles: files.length,
      processingFiles: filesToProcess.length,
    });

    // Queue codec detection for each file
    // Note: We're calling the internal codec-info API endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    for (const file of filesToProcess) {
      try {
        // Fire and forget - don't wait for codec detection to complete
        // This is intentionally async to not block the response
        void fetch(`${baseUrl}/api/codec-info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            infohash,
            fileIndex: file.file_index,
          }),
        }).catch((fetchError) => {
          logger.warn('Codec detection request failed', {
            torrentId,
            fileId: file.id,
            error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
          });
        });

        queuedFileIds.push(file.id);
      } catch (error) {
        logger.warn('Failed to queue codec detection for file', {
          torrentId,
          fileId: file.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Codec detection queued', {
      torrentId,
      filesProcessed: queuedFileIds.length,
    });

    return {
      success: true,
      filesProcessed: queuedFileIds.length,
      queuedFileIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Codec detection failed', error instanceof Error ? error : undefined, {
      torrentId,
      error: errorMessage,
    });

    return {
      success: false,
      filesProcessed: 0,
      skippedReason: 'error',
      error: errorMessage,
    };
  }
}
