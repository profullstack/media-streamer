'use client';

/**
 * Google Cast sender
 *
 * Loads the Cast Web Sender SDK once, on demand, and points it at Google's
 * Default Media Receiver, which plays MP4/WebM, MP3/AAC/FLAC and HLS straight
 * from a URL. No receiver app to register or host. The SDK only exists in
 * Chromium browsers (Chrome, Edge, Brave, Android Chrome); everywhere else
 * `loadCastSdk` resolves null and the cast button stays hidden. Safari users
 * have AirPlay in the native player controls.
 *
 * The SDK has no npm types worth a dependency, so the few shapes used here
 * are declared locally.
 */

import { CAST_TOKEN_PARAM } from './token';

const SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const SDK_TIMEOUT_MS = 8000;

export type CastState = 'NO_DEVICES_AVAILABLE' | 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED';

interface CastSessionLike {
  getCastDevice(): { friendlyName: string };
  loadMedia(request: unknown): Promise<unknown>;
}

interface CastContextLike {
  setOptions(options: Record<string, unknown>): void;
  getCastState(): CastState;
  requestSession(): Promise<unknown>;
  getCurrentSession(): CastSessionLike | null;
  endCurrentSession(stopCasting: boolean): void;
  addEventListener(type: string, handler: (event: { castState?: CastState }) => void): void;
  removeEventListener(type: string, handler: (event: { castState?: CastState }) => void): void;
}

interface RemotePlayerLike {
  isPaused: boolean;
  isConnected: boolean;
  currentTime: number;
}

interface RemotePlayerControllerLike {
  playOrPause(): void;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

interface CastGlobals {
  cast: {
    framework: {
      CastContext: { getInstance(): CastContextLike };
      CastContextEventType: { CAST_STATE_CHANGED: string };
      RemotePlayer: new () => RemotePlayerLike;
      RemotePlayerController: new (player: RemotePlayerLike) => RemotePlayerControllerLike;
      RemotePlayerEventType: { ANY_CHANGE: string };
    };
  };
  chrome: {
    cast: {
      AutoJoinPolicy: { ORIGIN_SCOPED: string };
      Image: new (url: string) => unknown;
      media: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        MediaInfo: new (contentId: string, contentType: string) => Record<string, unknown>;
        GenericMediaMetadata: new () => Record<string, unknown>;
        MovieMediaMetadata: new () => Record<string, unknown>;
        MusicTrackMediaMetadata: new () => Record<string, unknown>;
        LoadRequest: new (mediaInfo: unknown) => Record<string, unknown>;
        StreamType: { BUFFERED: string; LIVE: string };
        HlsSegmentFormat: { AAC: string; TS: string; FMP4: string };
        HlsVideoSegmentFormat: { MPEG2_TS: string; FMP4: string };
      };
    };
  };
}

export interface CastSdk {
  context: CastContextLike;
  globals: CastGlobals;
  player: RemotePlayerLike;
  controller: RemotePlayerControllerLike;
}

let sdkPromise: Promise<CastSdk | null> | null = null;

function isChromium(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS browsers are all WebKit underneath and have no Cast SDK.
  const ua = navigator.userAgent;
  return /Chrome\/|Edg\//.test(ua) && !/CriOS|EdgiOS|FxiOS/.test(ua);
}

/** The initialised SDK, or null where casting is unavailable. Safe to call repeatedly. */
export function loadCastSdk(): Promise<CastSdk | null> {
  if (sdkPromise) return sdkPromise;
  if (!isChromium()) {
    sdkPromise = Promise.resolve(null);
    return sdkPromise;
  }

  sdkPromise = new Promise<CastSdk | null>((resolve) => {
    const w = window as unknown as Window & Partial<CastGlobals> & {
      __onGCastApiAvailable?: (available: boolean) => void;
    };
    const timer = window.setTimeout(() => resolve(null), SDK_TIMEOUT_MS);

    w.__onGCastApiAvailable = (available: boolean) => {
      window.clearTimeout(timer);
      if (!available || !w.cast?.framework || !w.chrome?.cast) {
        resolve(null);
        return;
      }
      const globals = { cast: w.cast, chrome: w.chrome } as CastGlobals;
      const context = globals.cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: globals.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: globals.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      const player = new globals.cast.framework.RemotePlayer();
      const controller = new globals.cast.framework.RemotePlayerController(player);
      resolve({ context, globals, player, controller });
    };

    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

// ---------------------------------------------------------------------------
// Media description
// ---------------------------------------------------------------------------

export interface CastMedia {
  /** What the local player plays: an absolute URL or a path on this site. */
  url: string;
  /** MIME type; guessed from `url`/`filename` when omitted. */
  contentType?: string;
  /** Used for type guessing when the URL has no extension (`/api/stream?…`). */
  filename?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  /** Live TV and radio: no seek bar, no duration. */
  live?: boolean;
  kind?: 'video' | 'audio';
  /** Resume position in seconds. */
  startTime?: number;
}

const HLS_TYPE = 'application/x-mpegURL';

const TYPES_BY_EXT: Record<string, string> = {
  m3u8: HLS_TYPE,
  m3u: HLS_TYPE,
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
};

function extensionOf(text: string | undefined): string | null {
  if (!text) return null;
  const path = text.split(/[?#]/)[0] ?? '';
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  return m ? m[1]!.toLowerCase() : null;
}

export function guessContentType(media: Pick<CastMedia, 'url' | 'filename' | 'contentType' | 'kind'>): string {
  if (media.contentType) return media.contentType;
  if (/\/api\/stream\/hls(\?|$)/.test(media.url)) return HLS_TYPE;
  if (/\/api\/(iptv-proxy|radio\/proxy)/.test(media.url) && /m3u8?/i.test(decodeURIComponent(media.url))) return HLS_TYPE;
  const ext = extensionOf(media.filename) ?? extensionOf(media.url);
  if (ext && TYPES_BY_EXT[ext]) return TYPES_BY_EXT[ext]!;
  return media.kind === 'audio' ? 'audio/mpeg' : 'video/mp4';
}

/** A receiver can only fetch http(s) URLs; a WebTorrent service-worker or blob URL is local to this tab. */
export function isCastableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('blob:') || url.startsWith('data:')) return false;
  if (url.startsWith('/')) return url.startsWith('/api/');
  return /^https?:\/\//i.test(url);
}

function isOurs(url: string): boolean {
  return url.startsWith('/') || url.startsWith(`${window.location.origin}/`);
}

function absolute(url: string): string {
  return new URL(url, window.location.href).toString();
}

async function mintToken(): Promise<string> {
  const res = await fetch('/api/cast/token', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Could not start casting (${res.status})`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

/** The URL the receiver fetches: absolute, and carrying a cast token when it is one of ours. */
export async function receiverUrl(url: string): Promise<string> {
  const abs = new URL(absolute(url));
  if (isOurs(url)) abs.searchParams.set(CAST_TOKEN_PARAM, await mintToken());
  return abs.toString();
}

type SegmentFormat = 'ts' | 'fmp4' | 'aac';

/**
 * The Default Media Receiver assumes MPEG-TS segments unless told otherwise,
 * and our torrent transcodes are often fMP4, so peek at the playlist (one
 * variant deep). Fetched as this page, with its session; a CORS refusal on a
 * third-party URL just leaves the default.
 */
async function probeSegmentFormat(url: string): Promise<SegmentFormat | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    let text = await res.text();
    if (text.includes('#EXT-X-STREAM-INF')) {
      const variant = text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
      if (!variant) return null;
      const vres = await fetch(new URL(variant, absolute(url)).toString(), { credentials: 'same-origin' });
      if (!vres.ok) return null;
      text = await vres.text();
    }
    if (/#EXT-X-MAP|\.m4s\b|\.mp4\b/i.test(text)) return 'fmp4';
    if (/\.aac\b/i.test(text)) return 'aac';
    return 'ts';
  } catch {
    return null;
  }
}

export async function castMedia(sdk: CastSdk, media: CastMedia): Promise<void> {
  const { context, globals } = sdk;
  const m = globals.chrome.cast.media;

  if (!context.getCurrentSession()) {
    await context.requestSession();
  }
  const session = context.getCurrentSession();
  if (!session) throw new Error('No cast device selected');

  const contentType = guessContentType(media);
  const url = await receiverUrl(media.url);
  const info = new m.MediaInfo(url, contentType);
  info.contentUrl = url;
  info.streamType = media.live ? m.StreamType.LIVE : m.StreamType.BUFFERED;

  if (contentType === HLS_TYPE) {
    const format = await probeSegmentFormat(media.url);
    if (format === 'fmp4') {
      info.hlsSegmentFormat = m.HlsSegmentFormat.FMP4;
      info.hlsVideoSegmentFormat = m.HlsVideoSegmentFormat.FMP4;
    } else if (format === 'aac') {
      info.hlsSegmentFormat = m.HlsSegmentFormat.AAC;
    } else if (format === 'ts') {
      info.hlsSegmentFormat = m.HlsSegmentFormat.TS;
      info.hlsVideoSegmentFormat = m.HlsVideoSegmentFormat.MPEG2_TS;
    }
  }

  const isAudio = media.kind === 'audio' || contentType.startsWith('audio/');
  const metadata = isAudio ? new m.MusicTrackMediaMetadata() : new m.GenericMediaMetadata();
  metadata.title = media.title;
  if (media.subtitle) {
    if (isAudio) metadata.artist = media.subtitle;
    else metadata.subtitle = media.subtitle;
  }
  if (media.imageUrl) metadata.images = [new globals.chrome.cast.Image(absolute(media.imageUrl))];
  info.metadata = metadata;

  const request = new m.LoadRequest(info);
  request.autoplay = true;
  if (!media.live && media.startTime && media.startTime > 1) request.currentTime = media.startTime;

  await session.loadMedia(request);
}
