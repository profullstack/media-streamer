import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  buildSeedboxFileUrl,
  fetchSeedboxFile,
  filesAuthHeaders,
  loadAccountSeedboxConfig,
} from '@/lib/seedbox';
import { getFileTranscodingService } from '@/lib/file-transcoding';
import { needsTranscoding } from '@/lib/transcoding';

// Stream a completed file from the seedbox file server (torlnk files) back to the
// browser. Web-friendly files are proxied byte-for-byte (Range forwarded for
// seeking); non-web-friendly containers/codecs (mkv, HEVC/10-bit, avi, …) are
// transcoded on the fly to H.264/AAC fragmented MP4 by ffmpeg reading the
// seedbox URL directly — the same transcode pipeline the swarm player uses. We
// proxy rather than redirect so the seedbox token stays server-side.

// A single completed-file stream is a slow, long-lived response; don't let the
// platform try to statically optimize or cache it.
export const dynamic = 'force-dynamic';

// Audio codecs that don't play everywhere (esp. iOS/Safari, which can't do
// FLAC/OGG/Opus) → transcode to MP3. mp3/aac/m4a/wav are already universal.
const AUDIO_TRANSCODE_EXTS = new Set([
  'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'ape', 'wv', 'tta',
]);

// torlink's file server often serves media as application/octet-stream, which
// strict players (iOS/Safari) reject with a "Format error". For raw-proxied
// (web-friendly) files we set the Content-Type from the extension instead of
// trusting upstream.
const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/opus', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
};

/**
 * Is this file actually present + complete on the seedbox? torlink's file server
 * 404s files it doesn't have on disk (still downloading, or purged), so a cheap
 * 1-byte GET tells us whether it's ready to play.
 */
async function isReady(files: NonNullable<Awaited<ReturnType<typeof loadAccountSeedboxConfig>>>['files'], filePath: string): Promise<boolean> {
  if (!files) return false;
  try {
    const res = await fetchSeedboxFile(files, filePath, { method: 'GET', range: 'bytes=0-0' });
    // Drain the tiny body so the socket can be reused/closed.
    await res.arrayBuffer().catch(() => undefined);
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

async function proxy(request: NextRequest, method: 'GET' | 'HEAD'): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const config = await loadAccountSeedboxConfig(user.id);
  if (!config?.files) {
    return NextResponse.json({ error: 'No seedbox file server is configured' }, { status: 404 });
  }

  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) {
    return NextResponse.json({ error: 'A file path is required' }, { status: 400 });
  }

  // Readiness probe: `?probe=1` returns 200 if the file is on the seedbox, 404 if
  // not — the client uses this to decide seedbox vs platform playback up front.
  if (request.nextUrl.searchParams.get('probe')) {
    const ok = await isReady(config.files, filePath);
    return NextResponse.json({ ready: ok }, { status: ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } });
  }

  // Non-web-friendly formats: transcode on the fly instead of proxying raw bytes
  // the browser can't decode. ffmpeg reads the authenticated seedbox URL itself.
  // Audio (FLAC/OGG/Opus/…) → MP3; everything else → H.264/AAC MP4.
  const ext = (filePath.split('.').pop() ?? '').toLowerCase();
  const isAudio = AUDIO_TRANSCODE_EXTS.has(ext);
  if (isAudio || needsTranscoding(filePath)) {
    const kind = isAudio ? 'audio' : 'video';
    const headers = new Headers({
      'Content-Type': kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
      'Cache-Control': 'private, no-store',
      // A live transcode isn't byte-seekable; advertise that so the player uses
      // progressive playback rather than issuing Range requests.
      'Accept-Ranges': 'none',
    });
    // Don't start ffmpeg on a file the seedbox doesn't have — that yields an
    // empty stream and a cryptic DEMUXER error. Report not-ready cleanly.
    if (!(await isReady(config.files, filePath))) {
      return NextResponse.json(
        { error: 'not_ready', message: 'This file is not available on your seedbox yet.' },
        { status: 404 }
      );
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }
    const url = buildSeedboxFileUrl(config.files.baseUrl, filePath);
    if (!url) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }
    try {
      const { stream, mimeType } = getFileTranscodingService().transcodeUrl(
        url,
        filesAuthHeaders(config.files),
        randomUUID(),
        { kind }
      );
      headers.set('Content-Type', mimeType);
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
        status: 200,
        headers,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Could not transcode from seedbox: ${detail}` }, { status: 502 });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetchSeedboxFile(config.files, filePath, {
      method,
      range: request.headers.get('range'),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Could not reach seedbox: ${detail}` }, { status: 502 });
  }

  // Pass through the status (200/206/404/416) and the headers a media element
  // needs to seek; strip hop-by-hop and auth-bearing headers.
  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Force a correct media Content-Type by extension (torlink usually sends
  // application/octet-stream, which players reject).
  const mime = EXT_MIME[ext];
  if (mime) headers.set('content-type', mime);
  headers.set('Cache-Control', 'private, no-store');

  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  return proxy(request, 'GET');
}

export async function HEAD(request: NextRequest): Promise<Response> {
  return proxy(request, 'HEAD');
}
