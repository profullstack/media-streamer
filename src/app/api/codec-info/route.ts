/**
 * Codec Info API Route
 * 
 * Detects codec information for video/audio files using FFprobe
 * and stores the results in the database.
 * 
 * GET /api/codec-info?infohash=xxx&fileIndex=0
 *   - Detects codec info for a file (does not save to DB)
 * 
 * POST /api/codec-info
 *   - Detects codec info and saves to database
 *   - Body: { infohash: string, fileIndex: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectCodecFromUrl, formatCodecInfoForDb } from '@/lib/codec-detection';
import { createServerClient } from '@/lib/supabase';

/**
 * Build the stream URL for a file
 */
function buildStreamUrl(infohash: string, fileIndex: number): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${baseUrl}/api/stream?infohash=${infohash}&fileIndex=${fileIndex}`;
}

/**
 * GET /api/codec-info
 * 
 * Detect codec information for a file without saving to database.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');

  // Validate required parameters
  if (!infohash) {
    return NextResponse.json(
      { error: 'Missing required parameter: infohash' },
      { status: 400 }
    );
  }

  if (!fileIndexStr) {
    return NextResponse.json(
      { error: 'Missing required parameter: fileIndex' },
      { status: 400 }
    );
  }

  const fileIndex = parseInt(fileIndexStr, 10);
  if (isNaN(fileIndex)) {
    return NextResponse.json(
      { error: 'fileIndex must be a valid number' },
      { status: 400 }
    );
  }

  try {
    // Build stream URL and detect codec
    const streamUrl = buildStreamUrl(infohash, fileIndex);
    const codecInfo = await detectCodecFromUrl(streamUrl, 60);

    return NextResponse.json({
      infohash,
      fileIndex,
      videoCodec: codecInfo.videoCodec,
      audioCodec: codecInfo.audioCodec,
      container: codecInfo.container,
      duration: codecInfo.duration,
      bitRate: codecInfo.bitRate,
      needsTranscoding: codecInfo.needsTranscoding,
      streams: codecInfo.streams,
    });
  } catch (error) {
    console.error('Codec detection failed:', error);
    return NextResponse.json(
      { error: 'Failed to detect codec', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Request body for POST /api/codec-info
 */
interface CodecInfoRequest {
  infohash: string;
  fileIndex: number;
}

/**
 * POST /api/codec-info
 * 
 * Detect codec information and save to database.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CodecInfoRequest;

  try {
    body = await request.json() as CodecInfoRequest;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!body.infohash) {
    return NextResponse.json(
      { error: 'Missing required field: infohash' },
      { status: 400 }
    );
  }

  if (body.fileIndex === undefined || body.fileIndex === null) {
    return NextResponse.json(
      { error: 'Missing required field: fileIndex' },
      { status: 400 }
    );
  }

  const { infohash, fileIndex } = body;

  try {
    // Build stream URL and detect codec
    const streamUrl = buildStreamUrl(infohash, fileIndex);
    const codecInfo = await detectCodecFromUrl(streamUrl, 60);
    const dbData = formatCodecInfoForDb(codecInfo);

    // Get Supabase client
    const supabase = createServerClient();

    // Find the torrent and file
    const { data: torrent, error: torrentError } = await supabase
      .from('bt_torrents')
      .select('id')
      .eq('infohash', infohash)
      .single();

    if (torrentError || !torrent) {
      return NextResponse.json(
        { error: 'Torrent not found', details: torrentError?.message },
        { status: 404 }
      );
    }

    // Find the file
    const { data: file, error: fileError } = await supabase
      .from('bt_torrent_files')
      .select('id, media_category')
      .eq('torrent_id', torrent.id)
      .eq('file_index', fileIndex)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'File not found', details: fileError?.message },
        { status: 404 }
      );
    }

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
          codec_detected_at: new Date().toISOString(),
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
          needs_transcoding: dbData.needs_transcoding,
          codec_detected_at: new Date().toISOString(),
        }, {
          onConflict: 'file_id',
        });

      if (updateError) {
        console.error('Failed to update audio metadata:', updateError);
      } else {
        saved = true;
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
