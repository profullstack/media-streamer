/**
 * Shared media-streaming core.
 *
 * Given a resolved upstream media URL (+ auth headers) or a seedbox files
 * config, stream it back to the browser. Web-friendly files are proxied
 * byte-for-byte (Range forwarded for seeking); non-web-friendly
 * containers/codecs (mkv, HEVC/10-bit, avi, FLAC/OGG/Opus, …) are transcoded on
 * the fly to H.264/AAC MP4 or MP3 by ffmpeg reading the authenticated upstream
 * URL directly. We proxy rather than redirect so the upstream token/creds stay
 * server-side.
 *
 * This is the code every paid streaming route delegates to:
 * - `/api/seedbox/stream` (personal) and `/api/public/shares/[slug]/stream`
 *   (seedbox rental) via `streamSeedboxFile`,
 * - `/api/public/vod/[slug]/stream` (VOD monetization) via `streamRemoteMedia`.
 */

import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import type { SeedboxFilesConfig } from './config';
import { buildSeedboxFileUrl, filesAuthHeaders } from './files';
import { getFileTranscodingService } from '@/lib/file-transcoding';
import { needsTranscoding } from '@/lib/transcoding';

// Audio codecs that don't play everywhere (esp. iOS/Safari) → transcode to MP3.
const AUDIO_TRANSCODE_EXTS = new Set([
  'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'ape', 'wv', 'tta',
]);

// Upstreams often serve media as application/octet-stream, which strict players
// reject. For raw-proxied files we set Content-Type by extension.
const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/opus', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
};

/** Extension (lowercase, no query) from a filename or URL hint. */
function extOf(hint: string): string {
  const noQuery = hint.split(/[?#]/)[0] ?? hint;
  return (noQuery.split('.').pop() ?? '').toLowerCase();
}

/**
 * Is this URL fetchable + ready (present/complete)? A cheap 1-byte GET tells us
 * (upstreams 404/deny when a file isn't on disk yet or creds are wrong).
 */
export async function isUrlReady(url: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-0' },
      redirect: 'follow',
    });
    await res.arrayBuffer().catch(() => undefined);
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

/** Back-compat: readiness of a seedbox files-config path. */
export async function isSeedboxFileReady(
  files: SeedboxFilesConfig,
  filePath: string
): Promise<boolean> {
  const url = buildSeedboxFileUrl(files.baseUrl, filePath);
  if (!url) return false;
  return isUrlReady(url, filesAuthHeaders(files));
}

export interface StreamOptions {
  method: 'GET' | 'HEAD';
  range?: string | null;
  /** `probe=1` — return 200 if the media is ready upstream, 404 if not. */
  probe?: boolean;
}

export interface ResolvedMedia {
  url: string;
  headers: Record<string, string>;
  /** Filename or extension hint used to pick MIME + transcode decision. */
  extHint: string;
}

/**
 * Stream (or probe/transcode) a resolved upstream media URL. The caller resolves
 * `url`/`headers` (from a seedbox files config, an Xtream URL, an M3U/manifest
 * entry, …) and authorizes the request.
 */
export async function streamRemoteMedia(media: ResolvedMedia, opts: StreamOptions): Promise<Response> {
  const { url, headers, extHint } = media;

  if (opts.probe) {
    const ok = await isUrlReady(url, headers);
    return NextResponse.json(
      { ready: ok },
      { status: ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const ext = extOf(extHint);
  const isAudio = AUDIO_TRANSCODE_EXTS.has(ext);

  // Non-web-friendly formats: transcode on the fly. ffmpeg reads the
  // authenticated upstream URL itself. Audio → MP3; everything else → H.264/AAC.
  if (isAudio || needsTranscoding(extHint)) {
    const kind = isAudio ? 'audio' : 'video';
    const outHeaders = new Headers({
      'Content-Type': kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
      'Cache-Control': 'private, no-store',
      // A live transcode isn't byte-seekable; advertise that.
      'Accept-Ranges': 'none',
    });
    if (!(await isUrlReady(url, headers))) {
      return NextResponse.json(
        { error: 'not_ready', message: 'This title is not available upstream yet.' },
        { status: 404 }
      );
    }
    if (opts.method === 'HEAD') {
      return new Response(null, { status: 200, headers: outHeaders });
    }
    try {
      const { stream, mimeType } = getFileTranscodingService().transcodeUrl(
        url,
        headers,
        randomUUID(),
        { kind }
      );
      outHeaders.set('Content-Type', mimeType);
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
        status: 200,
        headers: outHeaders,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Could not transcode: ${detail}` }, { status: 502 });
    }
  }

  let upstream: Response;
  try {
    const fetchHeaders: Record<string, string> = { ...headers };
    if (opts.range) fetchHeaders.Range = opts.range;
    upstream = await fetch(url, { method: opts.method, headers: fetchHeaders, redirect: 'follow' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Could not reach upstream: ${detail}` }, { status: 502 });
  }

  const outHeaders = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  const mime = EXT_MIME[ext];
  if (mime) outHeaders.set('content-type', mime);
  outHeaders.set('Cache-Control', 'private, no-store');

  return new Response(opts.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

/**
 * Stream a completed file from a seedbox files server. Thin wrapper that
 * resolves the files config to a URL + auth headers, then delegates to
 * {@link streamRemoteMedia}.
 */
export async function streamSeedboxFile(
  files: SeedboxFilesConfig,
  filePath: string,
  opts: StreamOptions
): Promise<Response> {
  const url = buildSeedboxFileUrl(files.baseUrl, filePath);
  if (!url) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }
  return streamRemoteMedia({ url, headers: filesAuthHeaders(files), extHint: filePath }, opts);
}
