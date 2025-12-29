/**
 * Torrent Enrichment API Route
 *
 * POST /api/torrents/[id]/enrich - Trigger metadata enrichment for a torrent
 *
 * This endpoint fetches metadata (posters, covers, descriptions) from external APIs
 * based on the torrent name and updates the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  enrichTorrentMetadata,
  type EnrichmentResult,
} from '@/lib/metadata-enrichment';

// ============================================================================
// Types
// ============================================================================

interface EnrichmentResponse {
  success: boolean;
  torrentId: string;
  enrichment: EnrichmentResult;
  updated: boolean;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Configuration
// ============================================================================

const MUSICBRAINZ_USER_AGENT = 'BitTorrented/1.0.0 (https://bittorrented.com)';

// ============================================================================
// Route Handler
// ============================================================================

/**
 * POST /api/torrents/[id]/enrich
 *
 * Trigger metadata enrichment for a specific torrent.
 * Fetches metadata from external APIs (MusicBrainz, OMDb, Fanart.tv, Open Library)
 * and updates the torrent record in the database.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<EnrichmentResponse | ErrorResponse>> {
  const { id: torrentId } = await params;

  // Validate torrent ID
  if (!torrentId) {
    return NextResponse.json(
      { error: 'Torrent ID is required' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Fetch the torrent
  const { data: torrent, error: fetchError } = await supabase
    .from('torrents')
    .select('id, name, infohash, status, content_type, poster_url, cover_url')
    .eq('id', torrentId)
    .single();

  if (fetchError || !torrent) {
    console.error('[Enrich API] Torrent not found:', torrentId, fetchError);
    return NextResponse.json(
      { error: 'Torrent not found' },
      { status: 404 }
    );
  }

  console.log('[Enrich API] Enriching torrent:', torrent.name);

  // Get API keys from environment
  const omdbApiKey = process.env.OMDB_API_KEY;
  const fanartTvApiKey = process.env.FANART_TV_API_KEY;

  // Enrich metadata
  const enrichment = await enrichTorrentMetadata(torrent.name, {
    omdbApiKey,
    fanartTvApiKey,
    musicbrainzUserAgent: MUSICBRAINZ_USER_AGENT,
  });

  console.log('[Enrich API] Enrichment result:', {
    contentType: enrichment.contentType,
    title: enrichment.title,
    year: enrichment.year,
    hasPoster: !!enrichment.posterUrl,
    hasCover: !!enrichment.coverUrl,
    hasArtistImage: !!enrichment.artistImageUrl,
    error: enrichment.error,
  });

  // Update the torrent with enriched metadata
  let updated = false;
  const hasMetadata =
    enrichment.posterUrl ||
    enrichment.coverUrl ||
    enrichment.externalId ||
    enrichment.year;

  if (hasMetadata || enrichment.contentType !== 'other') {
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

    const { error: updateError } = await supabase
      .from('torrents')
      .update(updateData)
      .eq('id', torrentId);

    if (updateError) {
      console.error('[Enrich API] Failed to update torrent:', updateError);
    } else {
      updated = true;
      console.log('[Enrich API] Torrent updated successfully');
    }
  }

  return NextResponse.json({
    success: true,
    torrentId,
    enrichment,
    updated,
  });
}
