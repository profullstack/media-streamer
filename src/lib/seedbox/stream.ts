/**
 * Shared seedbox file-streaming core.
 *
 * Given a resolved files-server config and a torrent-relative path, stream a
 * completed file back to the browser. Web-friendly files are proxied
 * byte-for-byte (Range forwarded for seeking); non-web-friendly containers/codecs
 * (mkv, HEVC/10-bit, avi, FLAC/OGG/Opus, …) are transcoded on the fly to
 * H.264/AAC MP4 or MP3 by ffmpeg reading the authenticated seedbox URL directly.
 * We proxy rather than redirect so the seedbox token stays server-side.
 *
 * This is the code both the authenticated personal stream route
 * (`/api/seedbox/stream`) and the public rental route
 * (`/api/public/shares/[slug]/stream`) delegate to — they differ only in how
 * they resolve `files` and authorize the caller.
 */

import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import type { SeedboxFilesConfig } from './config';
import { buildSeedboxFileUrl, fetchSeedboxFile, filesAuthHeaders } from './files';
import { getFileTranscodingService } from '@/lib/file-transcoding';
import { needsTranscoding } from '@/lib/transcoding';

// Audio codecs that don't play everywhere (esp. iOS/Safari) → transcode to MP3.
const AUDIO_TRANSCODE_EXTS = new Set([
  'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'ape', 'wv', 'tta',
]);

// torlink's file server often serves media as application/octet-stream, which
// strict players reject. For raw-proxied files we set Content-Type by extension.
const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/opus', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
};

/**
 * Is this file present + complete on the seedbox? torlink's file server 404s
 * files it doesn't have on disk (still downloading, or purged), so a cheap
 * 1-byte GET tells us whether it's ready to play.
 */
export async function isSeedboxFileReady(
  files: SeedboxFilesConfig,
  filePath: string
): Promise<boolean> {
  try {
    const res = await fetchSeedboxFile(files, filePath, { method: 'GET', range: 'bytes=0-0' });
    await res.arrayBuffer().catch(() => undefined);
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

export interface StreamOptions {
  method: 'GET' | 'HEAD';
  range?: string | null;
  /** `probe=1` — return 200 if the file is ready on the seedbox, 404 if not. */
  probe?: boolean;
}

/**
 * Stream (or probe/transcode) a completed seedbox file. The caller is
 * responsible for resolving `files` and authorizing the request.
 */
export async function streamSeedboxFile(
  files: SeedboxFilesConfig,
  filePath: string,
  opts: StreamOptions
): Promise<Response> {
  if (opts.probe) {
    const ok = await isSeedboxFileReady(files, filePath);
    return NextResponse.json(
      { ready: ok },
      { status: ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const ext = (filePath.split('.').pop() ?? '').toLowerCase();
  const isAudio = AUDIO_TRANSCODE_EXTS.has(ext);

  // Non-web-friendly formats: transcode on the fly. ffmpeg reads the
  // authenticated seedbox URL itself. Audio → MP3; everything else → H.264/AAC.
  if (isAudio || needsTranscoding(filePath)) {
    const kind = isAudio ? 'audio' : 'video';
    const headers = new Headers({
      'Content-Type': kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
      'Cache-Control': 'private, no-store',
      // A live transcode isn't byte-seekable; advertise that.
      'Accept-Ranges': 'none',
    });
    if (!(await isSeedboxFileReady(files, filePath))) {
      return NextResponse.json(
        { error: 'not_ready', message: 'This file is not available on the seedbox yet.' },
        { status: 404 }
      );
    }
    if (opts.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }
    const url = buildSeedboxFileUrl(files.baseUrl, filePath);
    if (!url) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }
    try {
      const { stream, mimeType } = getFileTranscodingService().transcodeUrl(
        url,
        filesAuthHeaders(files),
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
    upstream = await fetchSeedboxFile(files, filePath, {
      method: opts.method,
      range: opts.range,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Could not reach seedbox: ${detail}` }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const mime = EXT_MIME[ext];
  if (mime) headers.set('content-type', mime);
  headers.set('Cache-Control', 'private, no-store');

  return new Response(opts.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
