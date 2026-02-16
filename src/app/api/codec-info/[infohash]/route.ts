/**
 * Codec Info API Route (Dynamic)
 * 
 * Detects codec information for video/audio files using FFprobe
 * and stores the results in the database.
 * 
 * GET /api/codec-info/[infohash]
 *   - Returns cached codec info from database if available
 *   - Falls back to detection if not cached
 * 
 * GET /api/codec-info/[infohash]?fileIndex=0
 *   - Returns codec info for a specific file
 * 
 * POST /api/codec-info/[infohash]
 *   - Detects codec info and saves to database
 *   - Body: { fileIndex?: number } (optional, defaults to first video/audio file)
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectCodecFromUrl, formatCodecInfoForDb } from '@/lib/codec-detection';
import { createServerClient } from '@/lib/supabase';
import { getWebTorrentDir } from '@/lib/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Route params
 */
interface RouteParams {
  params: Promise<{
    infohash: string;
  }>;
}

/**
 * Build the stream URL for a file
 */
function buildStreamUrl(infohash: string, fileIndex: number): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${baseUrl}/api/stream?infohash=${infohash}&fileIndex=${fileIndex}`;
}

/**
 * GET /api/codec-info/[infohash]
 * 
 * Get codec information from database or detect if not cached.
 * 
 * Query params:
 * - fileIndex: (optional) specific file index to check
 * 
 * If no fileIndex is provided, returns torrent-level codec info.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { infohash } = await params;
  const searchParams = request.nextUrl.searchParams;
  const fileIndexStr = searchParams.get('fileIndex');

  // Validate infohash
  if (!infohash || infohash.length !== 40) {
    return NextResponse.json(
      { error: 'Invalid infohash' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Get the torrent
  const { data: torrent, error: torrentError } = await supabase
    .from('bt_torrents')
    .select('id, video_codec, audio_codec, container, needs_transcoding, codec_detected_at')
    .eq('infohash', infohash)
    .single();

  if (torrentError || !torrent) {
    // Torrent not in DB — try to detect from local WebTorrent download via FFprobe
    try {
      const downloadDir = getWebTorrentDir();
      if (existsSync(downloadDir)) {
        const { readdirSync, statSync } = await import('node:fs');
        const subdirs = readdirSync(downloadDir);
        // Find media files in subdirectories — WebTorrent stores as downloadDir/torrentName/file
        for (const subdir of subdirs) {
          const subdirPath = join(downloadDir, subdir);
          if (!statSync(subdirPath).isDirectory()) continue;
          const files = readdirSync(subdirPath);
          const mediaExts = new Set(['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'flac', 'ogg', 'wav']);
          const mediaFiles = files.filter(f => {
            const ext = f.split('.').pop()?.toLowerCase();
            return ext && mediaExts.has(ext);
          });
          const targetIdx = fileIndexStr ? parseInt(fileIndexStr, 10) : 0;
          const targetFile = mediaFiles[targetIdx];
          if (targetFile) {
            const filePath = join(subdirPath, targetFile);
            const codecInfo = await detectCodecFromUrl(filePath, 15);
            const formatted = formatCodecInfoForDb(codecInfo);
            return NextResponse.json({
              infohash,
              fileIndex: targetIdx,
              videoCodec: formatted.video_codec,
              audioCodec: formatted.audio_codec,
              container: formatted.container,
              needsTranscoding: formatted.needs_transcoding,
              duration: formatted.duration_seconds,
              bitRate: formatted.bit_rate,
              resolution: formatted.resolution,
              cached: false,
              source: 'ffprobe-local',
            });
          }
        }
      }
    } catch {
      // Fall through to 404
    }

    return NextResponse.json(
      { error: 'Torrent not found' },
      { status: 404 }
    );
  }

  // If no fileIndex specified, return torrent-level codec info
  if (!fileIndexStr) {
    // Check if we have cached codec info at torrent level
    if (torrent.codec_detected_at) {
      return NextResponse.json({
        infohash,
        videoCodec: torrent.video_codec,
        audioCodec: torrent.audio_codec,
        container: torrent.container,
        needsTranscoding: torrent.needs_transcoding,
        cached: true,
        detectedAt: torrent.codec_detected_at,
      });
    }

    // No cached info - return that detection is needed
    return NextResponse.json({
      infohash,
      videoCodec: null,
      audioCodec: null,
      container: null,
      needsTranscoding: null,
      cached: false,
      message: 'Codec info not detected yet. POST to this endpoint to detect.',
    });
  }

  // File-specific codec info requested
  const fileIndex = parseInt(fileIndexStr, 10);
  if (isNaN(fileIndex)) {
    return NextResponse.json(
      { error: 'fileIndex must be a valid number' },
      { status: 400 }
    );
  }

  // Get the file
  const { data: file, error: fileError } = await supabase
    .from('bt_torrent_files')
    .select('id, media_category')
    .eq('torrent_id', torrent.id)
    .eq('file_index', fileIndex)
    .single();

  if (fileError || !file) {
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }

  // Check for cached codec info based on media type
  if (file.media_category === 'video') {
    const { data: videoMeta } = await supabase
      .from('bt_video_metadata')
      .select('codec, audio_codec, container, needs_transcoding, codec_detected_at')
      .eq('file_id', file.id)
      .single();

    if (videoMeta?.codec_detected_at) {
      return NextResponse.json({
        infohash,
        fileIndex,
        videoCodec: videoMeta.codec,
        audioCodec: videoMeta.audio_codec,
        container: videoMeta.container,
        needsTranscoding: videoMeta.needs_transcoding,
        cached: true,
        detectedAt: videoMeta.codec_detected_at,
      });
    }
  } else if (file.media_category === 'audio') {
    const { data: audioMeta } = await supabase
      .from('bt_audio_metadata')
      .select('codec, container, codec_detected_at')
      .eq('file_id', file.id)
      .single();

    if (audioMeta?.codec_detected_at) {
      return NextResponse.json({
        infohash,
        fileIndex,
        videoCodec: null,
        audioCodec: audioMeta.codec,
        container: audioMeta.container,
        needsTranscoding: false, // Audio files don't need transcoding
        cached: true,
        detectedAt: audioMeta.codec_detected_at,
      });
    }
  }

  // No cached info for this file
  return NextResponse.json({
    infohash,
    fileIndex,
    videoCodec: null,
    audioCodec: null,
    container: null,
    needsTranscoding: null,
    cached: false,
    message: 'Codec info not detected yet. POST to this endpoint to detect.',
  });
}

/**
 * Request body for POST /api/codec-info/[infohash]
 */
interface CodecInfoRequest {
  fileIndex?: number;
}

/**
 * POST /api/codec-info/[infohash]
 * 
 * Detect codec information and save to database.
 * 
 * Body:
 * - fileIndex: (optional) specific file index to detect
 *   If not provided, detects the first video or audio file and saves to torrent level.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { infohash } = await params;

  // Validate infohash
  if (!infohash || infohash.length !== 40) {
    return NextResponse.json(
      { error: 'Invalid infohash' },
      { status: 400 }
    );
  }

  let body: CodecInfoRequest = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text) as CodecInfoRequest;
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Get the torrent
  const { data: torrent, error: torrentError } = await supabase
    .from('bt_torrents')
    .select('id')
    .eq('infohash', infohash)
    .single();

  if (torrentError || !torrent) {
    return NextResponse.json(
      { error: 'Torrent not found' },
      { status: 404 }
    );
  }

  // Determine which file to detect
  let fileIndex = body.fileIndex;
  let file: { id: string; media_category: string | null } | null = null;

  if (fileIndex !== undefined) {
    // Specific file requested
    const { data: specificFile, error: fileError } = await supabase
      .from('bt_torrent_files')
      .select('id, media_category')
      .eq('torrent_id', torrent.id)
      .eq('file_index', fileIndex)
      .single();

    if (fileError || !specificFile) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    file = specificFile;
  } else {
    // Find the first video or audio file
    const { data: mediaFiles } = await supabase
      .from('bt_torrent_files')
      .select('id, file_index, media_category')
      .eq('torrent_id', torrent.id)
      .in('media_category', ['video', 'audio'])
      .order('file_index', { ascending: true })
      .limit(1);

    if (!mediaFiles || mediaFiles.length === 0) {
      return NextResponse.json(
        { error: 'No video or audio files found in torrent' },
        { status: 404 }
      );
    }

    file = mediaFiles[0];
    fileIndex = mediaFiles[0].file_index;
  }

  // Skip detection for non-media files
  if (file.media_category !== 'video' && file.media_category !== 'audio') {
    return NextResponse.json({
      infohash,
      fileIndex,
      message: 'File is not a video or audio file, skipping codec detection',
      skipped: true,
    });
  }

  try {
    // Build stream URL and detect codec
    const streamUrl = buildStreamUrl(infohash, fileIndex);
    const codecInfo = await detectCodecFromUrl(streamUrl, 60);
    const dbData = formatCodecInfoForDb(codecInfo);
    const now = new Date().toISOString();

    // Update the appropriate metadata table based on media category
    let saved = false;

    if (file.media_category === 'video') {
      const { error: updateError } = await supabase
        .from('bt_video_metadata')
        .upsert({
          file_id: file.id,
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

      if (updateError) {
        console.error('Failed to update video metadata:', updateError);
      } else {
        saved = true;
      }
    } else if (file.media_category === 'audio') {
      const { error: updateError } = await supabase
        .from('bt_audio_metadata')
        .upsert({
          file_id: file.id,
          codec: dbData.audio_codec,
          container: dbData.container,
          duration_seconds: dbData.duration_seconds,
          bitrate: dbData.bit_rate,
          codec_detected_at: now,
        }, {
          onConflict: 'file_id',
        });

      if (updateError) {
        console.error('Failed to update audio metadata:', updateError);
      } else {
        saved = true;
      }
    }

    // Also update torrent-level codec info for video files
    // This ensures the torrent details page shows codec info regardless of how detection was triggered
    if (saved && file.media_category === 'video') {
      const { error: torrentUpdateError } = await supabase
        .from('bt_torrents')
        .update({
          video_codec: dbData.video_codec,
          audio_codec: dbData.audio_codec,
          container: dbData.container,
          needs_transcoding: dbData.needs_transcoding,
          codec_detected_at: now,
        })
        .eq('id', torrent.id);

      if (torrentUpdateError) {
        console.error('Failed to update torrent codec info:', torrentUpdateError);
      }
    }

    return NextResponse.json({
      infohash,
      fileIndex,
      videoCodec: codecInfo.videoCodec,
      audioCodec: codecInfo.audioCodec,
      container: codecInfo.container,
      duration: codecInfo.duration,
      bitRate: codecInfo.bitRate,
      needsTranscoding: codecInfo.needsTranscoding,
      resolution: dbData.resolution,
      saved,
    });
  } catch (error) {
    console.error('Codec detection failed:', error);
    return NextResponse.json(
      { error: 'Failed to detect codec', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
