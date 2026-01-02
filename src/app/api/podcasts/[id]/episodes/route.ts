/**
 * Podcast Episodes API Route
 *
 * GET /api/podcasts/[id]/episodes - Get episodes for a podcast
 *
 * Public endpoint - no authentication required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPodcastService } from '@/lib/podcasts';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/podcasts/[id]/episodes
 * 
 * Query parameters:
 * - limit: Number of episodes to return (default: 20, max: 100)
 * - offset: Offset for pagination (default: 0)
 * 
 * Returns:
 * - 200: Episodes list
 * - 404: Podcast not found
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { id: podcastId } = await params;
  const { searchParams } = new URL(request.url);
  
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  
  const limit = Math.min(Math.max(parseInt(limitParam ?? '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0);

  try {
    const service = getPodcastService();
    
    // Verify podcast exists
    const podcast = await service.getPodcastById(podcastId);
    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    const episodes = await service.getEpisodes(podcastId, limit, offset);
    
    return NextResponse.json({
      podcast: {
        id: podcast.id,
        title: podcast.title,
        author: podcast.author,
        imageUrl: podcast.image_url,
      },
      episodes: episodes.map(ep => ({
        id: ep.id,
        guid: ep.guid,
        title: ep.title,
        description: ep.description,
        audioUrl: ep.audio_url,
        durationSeconds: ep.duration_seconds,
        imageUrl: ep.image_url,
        publishedAt: ep.published_at,
        seasonNumber: ep.season_number,
        episodeNumber: ep.episode_number,
      })),
      pagination: {
        limit,
        offset,
        hasMore: episodes.length === limit,
      },
    });
  } catch (error) {
    console.error('[Podcasts] Error fetching episodes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch episodes' },
      { status: 500 }
    );
  }
}
