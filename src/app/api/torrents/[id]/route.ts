/**
 * Torrent Detail API Route
 *
 * GET /api/torrents/:id - Get torrent details with files (supports UUID or infohash)
 * DELETE /api/torrents/:id - Delete a torrent (supports UUID or infohash)
 *
 * Supports both user-submitted torrents (bt_torrents) and DHT torrents (Bitmagnet).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTorrentById,
  getTorrentByInfohash,
  getTorrentFiles,
  deleteTorrent,
  getDhtTorrentByInfohash,
  getDhtTorrentFiles,
  type DhtTorrent,
  type DhtTorrentFile,
} from '@/lib/supabase/queries';
import { transformTorrent, transformTorrentFiles } from '@/lib/transforms';
import type { Torrent } from '@/lib/supabase/types';
import type { TorrentFile as TransformedFile, MediaCategory } from '@/types';
import { getMediaCategory, getMimeType } from '@/lib/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Check if a string is a valid UUID v4
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Check if a string is a valid infohash (40 hex characters)
 */
function isInfohash(str: string): boolean {
  const infohashRegex = /^[0-9a-f]{40}$/i;
  return infohashRegex.test(str);
}

/**
 * Get torrent by either UUID or infohash from bt_torrents
 */
async function getUserTorrent(id: string): Promise<Torrent | null> {
  if (isUUID(id)) {
    return getTorrentById(id);
  } else if (isInfohash(id)) {
    return getTorrentByInfohash(id);
  }
  // If neither, try infohash first (more common in URLs)
  return getTorrentByInfohash(id);
}

/**
 * Extended torrent type with source field
 */
interface TorrentWithSource {
  id: string;
  infohash: string;
  magnetUri: string;
  name: string;
  cleanTitle: string | null;
  totalSize: number;
  fileCount: number;
  pieceLength: number;
  seeders: number | null;
  leechers: number | null;
  swarmUpdatedAt: string | null;
  posterUrl: string | null;
  coverUrl: string | null;
  contentType: string | null;
  year: number | null;
  description: string | null;
  director: string | null;
  actors: string | null;
  genre: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
  needsTranscoding: boolean | null;
  codecDetectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  source: 'user' | 'dht';
}

/**
 * Transform a DHT torrent to the response format
 */
function transformDhtTorrent(dht: DhtTorrent): TorrentWithSource {
  return {
    id: dht.infohash, // Use infohash as ID for DHT torrents
    infohash: dht.infohash,
    magnetUri: `magnet:?xt=urn:btih:${dht.infohash}&dn=${encodeURIComponent(dht.name)}`,
    name: dht.name,
    cleanTitle: null,
    totalSize: dht.size,
    fileCount: dht.files_count ?? 0,
    pieceLength: 0,
    seeders: dht.seeders,
    leechers: dht.leechers,
    swarmUpdatedAt: null,
    posterUrl: null,
    coverUrl: null,
    contentType: null,
    year: null,
    description: null,
    director: null,
    actors: null,
    genre: null,
    videoCodec: null,
    audioCodec: null,
    container: null,
    needsTranscoding: null,
    codecDetectedAt: null,
    createdAt: dht.created_at,
    updatedAt: dht.created_at,
    source: 'dht',
  };
}

/**
 * Transform DHT files to the response format
 * DHT files don't have piece information, so we use 0 as placeholder
 */
function transformDhtFiles(files: DhtTorrentFile[], infohash: string): TransformedFile[] {
  return files.map((f) => {
    const pathParts = f.path.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const ext = f.extension ?? fileName.split('.').pop() ?? '';

    return {
      id: `${infohash}-${f.index}`, // Synthetic ID
      torrentId: infohash,
      fileIndex: f.index,
      path: f.path,
      name: fileName,
      extension: ext,
      size: f.size,
      pieceStart: 0, // DHT files don't have piece info
      pieceEnd: 0,
      mediaCategory: getMediaCategory(fileName) as MediaCategory,
      mimeType: getMimeType(fileName),
      createdAt: new Date().toISOString(),
    };
  });
}

/**
 * GET /api/torrents/:id
 * Get torrent details with all files
 * Accepts either UUID or infohash as the ID parameter
 *
 * First tries to find the torrent in bt_torrents (user-submitted).
 * If not found, falls back to Bitmagnet's DHT torrents table.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // First try to get from user-submitted torrents (bt_torrents)
    const userTorrent = await getUserTorrent(id);

    if (userTorrent) {
      // Get files using the torrent's UUID
      const files = await getTorrentFiles(userTorrent.id);

      // Transform to camelCase for frontend
      const transformed = transformTorrent(userTorrent);
      const torrentWithSource: TorrentWithSource = {
        ...transformed,
        source: 'user',
      };

      return NextResponse.json({
        torrent: torrentWithSource,
        files: transformTorrentFiles(files),
      });
    }

    // Not found in user torrents - try DHT torrents (Bitmagnet)
    if (isInfohash(id)) {
      const dhtTorrent = await getDhtTorrentByInfohash(id);

      if (dhtTorrent) {
        // Get files from DHT
        const dhtFiles = await getDhtTorrentFiles(id);

        return NextResponse.json({
          torrent: transformDhtTorrent(dhtTorrent),
          files: transformDhtFiles(dhtFiles, id),
        });
      }
    }

    // Not found anywhere
    return NextResponse.json(
      { error: 'Torrent not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching torrent:', error);
    return NextResponse.json(
      { error: 'Failed to fetch torrent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/torrents/:id
 * Delete a torrent and all its files
 * Accepts either UUID or infohash as the ID parameter
 *
 * NOTE: Only user-submitted torrents can be deleted.
 * DHT torrents are managed by Bitmagnet.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Torrent ID is required' },
        { status: 400 }
      );
    }

    // Only allow deleting user-submitted torrents
    const torrent = await getUserTorrent(id);

    if (!torrent) {
      // Check if it's a DHT torrent
      if (isInfohash(id)) {
        const dhtTorrent = await getDhtTorrentByInfohash(id);
        if (dhtTorrent) {
          return NextResponse.json(
            { error: 'Cannot delete DHT torrents. Only user-submitted torrents can be deleted.' },
            { status: 403 }
          );
        }
      }

      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      );
    }

    // Delete torrent using UUID (cascade will delete files)
    await deleteTorrent(torrent.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting torrent:', error);
    return NextResponse.json(
      { error: 'Failed to delete torrent' },
      { status: 500 }
    );
  }
}
