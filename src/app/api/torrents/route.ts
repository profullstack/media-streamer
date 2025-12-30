/**
 * Torrents API
 *
 * GET /api/torrents - List all torrents (FREE - no auth required)
 * POST /api/torrents - Index a new torrent from magnet URI (FREE - no auth required)
 *
 * These endpoints are free to encourage torrent database growth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, resetServerClient } from '@/lib/supabase/client';
import { IndexerService, IndexerError } from '@/lib/indexer';
import { createLogger, generateRequestId } from '@/lib/logger';
import { transformTorrents } from '@/lib/transforms';
import {
  enrichTorrentMetadata,
  cleanTorrentNameForDisplay,
} from '@/lib/metadata-enrichment';
import { detectCodecFromUrl, formatCodecInfoForDb } from '@/lib/codec-detection';
import type { Torrent as DbTorrent } from '@/lib/supabase/types';

const logger = createLogger('API:torrents');

/**
 * Check if an error is a network/connection error that warrants client reset
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('socket hang up') ||
      message.includes('aborted')
    );
  }
  return false;
}

/**
 * Valid sort fields
 */
const VALID_SORT_BY = ['date', 'seeders', 'leechers', 'size', 'name'] as const;
type SortBy = typeof VALID_SORT_BY[number];

/**
 * Map sortBy parameter to database column
 */
const SORT_COLUMN_MAP: Record<SortBy, string> = {
  date: 'created_at',
  seeders: 'seeders',
  leechers: 'leechers',
  size: 'total_size',
  name: 'name',
};

/**
 * GET /api/torrents
 *
 * List all torrents with pagination.
 * FREE - No authentication required.
 *
 * Query parameters:
 * - limit: number (optional, default 50, max 100)
 * - offset: number (optional, default 0)
 * - page: number (optional) - Alternative to offset (page * limit)
 * - status: string (optional) - Filter by status
 * - sortBy: string (optional) - date, seeders, leechers, size, name (default: date)
 * - sortOrder: string (optional) - asc, desc (default: desc)
 *
 * Response:
 * - 200: List of torrents with pagination info
 * - 500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  const { searchParams } = new URL(request.url);
  
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  const pageParam = searchParams.get('page');
  const status = searchParams.get('status');
  const sortByParam = searchParams.get('sortBy');
  const sortOrderParam = searchParams.get('sortOrder');

  const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 100);
  
  // Support both offset and page-based pagination
  let offset: number;
  if (offsetParam) {
    offset = parseInt(offsetParam, 10);
  } else if (pageParam) {
    const page = parseInt(pageParam, 10);
    offset = (page - 1) * limit;
  } else {
    offset = 0;
  }

  // Validate and set sort options
  const sortBy: SortBy = sortByParam && VALID_SORT_BY.includes(sortByParam as SortBy)
    ? sortByParam as SortBy
    : 'date';
  const sortOrder = sortOrderParam === 'asc' ? 'asc' : 'desc';
  const sortColumn = SORT_COLUMN_MAP[sortBy];
  const ascending = sortOrder === 'asc';

  reqLogger.info('GET /api/torrents', { limit, offset, status, sortBy, sortOrder });

  try {
    const supabase = getServerClient();

    let query = supabase
      .from('torrents')
      .select('*', { count: 'exact' })
      .order(sortColumn, { ascending, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const validStatuses = ['pending', 'indexing', 'ready', 'error'] as const;
    if (status && validStatuses.includes(status as typeof validStatuses[number])) {
      query = query.eq('status', status as typeof validStatuses[number]);
    }

    reqLogger.debug('Executing Supabase query');
    const { data: torrents, error, count } = await query;

    if (error) {
      reqLogger.error('Failed to fetch torrents from database', error);
      // Reset client on connection errors to get a fresh connection next time
      if (isConnectionError(error)) {
        reqLogger.warn('Connection error detected, resetting Supabase client');
        resetServerClient();
      }
      return NextResponse.json(
        { error: 'Failed to fetch torrents', details: error.message },
        { status: 500 }
      );
    }

    reqLogger.info('Torrents fetched successfully', {
      count: torrents?.length ?? 0,
      total: count ?? 0
    });

    // Transform to camelCase for frontend
    const transformedTorrents = transformTorrents((torrents ?? []) as DbTorrent[]);

    // Calculate pagination info
    const totalCount = count ?? 0;
    const currentPage = Math.floor(offset / limit) + 1;
    const hasMore = offset + transformedTorrents.length < totalCount;

    return NextResponse.json({
      torrents: transformedTorrents,
      total: totalCount,
      limit,
      offset,
      // Include pagination object for frontend compatibility
      pagination: {
        page: currentPage,
        limit,
        total: totalCount,
        hasMore,
      },
    });
  } catch (error) {
    reqLogger.error('Torrents API error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/torrents
 *
 * Index a new torrent from a magnet URI.
 * FREE - No authentication required to encourage database growth.
 *
 * Request body:
 * - magnetUri: string (required) - The magnet URI to index
 *
 * Response:
 * - 201: New torrent indexed
 * - 200: Existing torrent returned
 * - 400: Invalid request
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  reqLogger.info('POST /api/torrents - Starting');
  
  let body: unknown;
  
  try {
    body = await request.json();
    reqLogger.debug('Request body parsed', { hasBody: !!body });
  } catch (parseError) {
    reqLogger.warn('Invalid JSON body', { error: String(parseError) });
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate request body
  if (!body || typeof body !== 'object') {
    reqLogger.warn('Request body is not an object');
    return NextResponse.json(
      { error: 'magnetUri is required' },
      { status: 400 }
    );
  }

  const { magnetUri } = body as { magnetUri?: string };

  if (!magnetUri || typeof magnetUri !== 'string' || magnetUri.trim() === '') {
    reqLogger.warn('magnetUri is missing or invalid');
    return NextResponse.json(
      { error: 'magnetUri is required' },
      { status: 400 }
    );
  }

  reqLogger.info('Indexing magnet URI', { 
    magnetUri: magnetUri.substring(0, 100) + '...' 
  });

  const indexer = new IndexerService();

  try {
    reqLogger.debug('Calling indexer.indexMagnet');
    const result = await indexer.indexMagnet(magnetUri);

    const status = result.isNew ? 201 : 200;
    reqLogger.info('Magnet indexed successfully', {
      torrentId: result.torrentId,
      infohash: result.infohash,
      name: result.name,
      isNew: result.isNew,
      status
    });

    // Auto-enrich new torrents with clean_title and metadata
    if (result.isNew) {
      reqLogger.info('Auto-enriching new torrent with metadata', {
        torrentName: result.name,
      });
      
      // Generate clean title
      const cleanTitle = cleanTorrentNameForDisplay(result.name);
      reqLogger.info('Generated clean title', { cleanTitle });
      
      // Fetch external metadata (poster, content_type, etc.)
      const omdbApiKey = process.env.OMDB_API_KEY;
      const fanartTvApiKey = process.env.FANART_TV_API_KEY;
      
      reqLogger.info('API keys status', {
        hasOmdbApiKey: !!omdbApiKey,
        hasFanartTvApiKey: !!fanartTvApiKey,
      });
      
      const enrichmentResult = await enrichTorrentMetadata(result.name, {
        omdbApiKey,
        fanartTvApiKey,
        musicbrainzUserAgent: 'BitTorrented/1.0.0 (https://bittorrented.com)',
      });
      
      reqLogger.info('Enrichment result', {
        contentType: enrichmentResult.contentType,
        posterUrl: enrichmentResult.posterUrl,
        coverUrl: enrichmentResult.coverUrl,
        year: enrichmentResult.year,
        title: enrichmentResult.title,
        externalId: enrichmentResult.externalId,
        externalSource: enrichmentResult.externalSource,
        error: enrichmentResult.error,
      });
      
      // Update torrent with enrichment data
      const supabase = getServerClient();
      const { error: updateError } = await supabase
        .from('torrents')
        .update({
          clean_title: cleanTitle,
          content_type: enrichmentResult.contentType !== 'other' ? enrichmentResult.contentType : null,
          poster_url: enrichmentResult.posterUrl ?? null,
          cover_url: enrichmentResult.coverUrl ?? null,
          year: enrichmentResult.year ?? null,
          description: enrichmentResult.description ?? null,
          external_id: enrichmentResult.externalId ?? null,
          external_source: enrichmentResult.externalSource ?? null,
          metadata_fetched_at: new Date().toISOString(),
        })
        .eq('id', result.torrentId);
      
      if (updateError) {
        reqLogger.warn('Failed to update torrent with enrichment data', { error: updateError.message });
        // Don't fail the request - the torrent was indexed successfully
      } else {
        reqLogger.info('Torrent enriched successfully', {
          torrentId: result.torrentId,
          cleanTitle,
          contentType: enrichmentResult.contentType,
        });
      }
      
      // Auto-detect codec for video/audio files
      // Find the first video or audio file
      const { data: mediaFiles } = await supabase
        .from('torrent_files')
        .select('id, file_index, media_category')
        .eq('torrent_id', result.torrentId)
        .in('media_category', ['video', 'audio'])
        .order('file_index', { ascending: true })
        .limit(1);
      
      if (mediaFiles && mediaFiles.length > 0) {
        const mediaFile = mediaFiles[0];
        reqLogger.info('Auto-detecting codec for first media file', {
          fileIndex: mediaFile.file_index,
          mediaCategory: mediaFile.media_category,
        });
        
        try {
          // Build stream URL and detect codec
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
          const streamUrl = `${baseUrl}/api/stream?infohash=${result.infohash}&fileIndex=${mediaFile.file_index}`;
          
          reqLogger.info('Detecting codec from stream URL', { streamUrl });
          const codecInfo = await detectCodecFromUrl(streamUrl, 60);
          const dbData = formatCodecInfoForDb(codecInfo);
          const now = new Date().toISOString();
          
          reqLogger.info('Codec detection result', {
            videoCodec: codecInfo.videoCodec,
            audioCodec: codecInfo.audioCodec,
            container: codecInfo.container,
            needsTranscoding: codecInfo.needsTranscoding,
          });
          
          // Update torrent-level codec info
          const { error: codecUpdateError } = await supabase
            .from('torrents')
            .update({
              video_codec: dbData.video_codec,
              audio_codec: dbData.audio_codec,
              container: dbData.container,
              needs_transcoding: dbData.needs_transcoding,
              codec_detected_at: now,
            })
            .eq('id', result.torrentId);
          
          if (codecUpdateError) {
            reqLogger.warn('Failed to update torrent with codec info', { error: codecUpdateError.message });
          } else {
            reqLogger.info('Codec info saved to torrent', {
              torrentId: result.torrentId,
              videoCodec: dbData.video_codec,
              audioCodec: dbData.audio_codec,
              needsTranscoding: dbData.needs_transcoding,
            });
          }
          
          // Also update the file-level metadata
          if (mediaFile.media_category === 'video') {
            const { error: videoMetaError } = await supabase
              .from('video_metadata')
              .upsert({
                file_id: mediaFile.id,
                codec: dbData.video_codec,
                audio_codec: dbData.audio_codec,
                container: dbData.container,
                duration_seconds: dbData.duration_seconds,
                bitrate: dbData.bit_rate,
                needs_transcoding: dbData.needs_transcoding,
                codec_detected_at: now,
              }, {
                onConflict: 'file_id',
              });
            
            if (videoMetaError) {
              reqLogger.warn('Failed to update video metadata', { error: videoMetaError.message });
            }
          } else if (mediaFile.media_category === 'audio') {
            const { error: audioMetaError } = await supabase
              .from('audio_metadata')
              .upsert({
                file_id: mediaFile.id,
                codec: dbData.audio_codec,
                container: dbData.container,
                duration_seconds: dbData.duration_seconds,
                bitrate: dbData.bit_rate,
                codec_detected_at: now,
              }, {
                onConflict: 'file_id',
              });
            
            if (audioMetaError) {
              reqLogger.warn('Failed to update audio metadata', { error: audioMetaError.message });
            }
          }
        } catch (codecError) {
          // Don't fail the request - codec detection is optional
          reqLogger.warn('Codec detection failed', {
            error: codecError instanceof Error ? codecError.message : String(codecError),
          });
        }
      } else {
        reqLogger.info('No video/audio files found for codec detection');
      }
    }

    return NextResponse.json({
      torrentId: result.torrentId,
      infohash: result.infohash,
      name: result.name,
      fileCount: result.fileCount,
      totalSize: result.totalSize,
      isNew: result.isNew,
    }, { status });
  } catch (error) {
    if (error instanceof IndexerError) {
      reqLogger.error('IndexerError during magnet indexing', error, {
        cause: error.cause?.message
      });
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    reqLogger.error('Unexpected error during magnet indexing', error);
    return NextResponse.json(
      { error: 'Failed to index torrent' },
      { status: 500 }
    );
  } finally {
    reqLogger.debug('Destroying indexer service');
    indexer.destroy();
  }
}
