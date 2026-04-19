import type { RadioStation, RadioStream } from './types';

export const CUSTOM_STATION_ID_PREFIX = 'custom:';
export const MANUAL_STATION_ID_PREFIX = 'manual:';
export const RADIO_BROWSER_STATION_ID_PREFIX = 'rb:';

export function normalizeStreamUrl(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('Stream URL is required');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid stream URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS stream URLs are supported');
  }

  return url.toString();
}

export function buildCustomStationId(streamUrl: string): string {
  return `${CUSTOM_STATION_ID_PREFIX}${encodeURIComponent(normalizeStreamUrl(streamUrl))}`;
}

export function parseCustomStationId(stationId: string): string | null {
  if (!stationId.startsWith(CUSTOM_STATION_ID_PREFIX)) {
    return null;
  }

  const encodedUrl = stationId.slice(CUSTOM_STATION_ID_PREFIX.length);
  if (!encodedUrl) {
    return null;
  }

  try {
    return normalizeStreamUrl(decodeURIComponent(encodedUrl));
  } catch {
    return null;
  }
}

function stripWww(hostname: string): string {
  return hostname.replace(/^www\./i, '');
}

function deriveStationName(streamUrl: string): string {
  const url = new URL(streamUrl);
  return stripWww(url.hostname);
}

export function createCustomRadioStation(params: {
  name?: string;
  streamUrl: string;
  genre?: string;
}): RadioStation {
  const streamUrl = normalizeStreamUrl(params.streamUrl);
  const name = params.name?.trim() || deriveStationName(streamUrl);
  const genre = params.genre?.trim();

  return {
    id: buildCustomStationId(streamUrl),
    name,
    description: 'Custom stream URL',
    genre: genre || 'Custom',
  };
}

export function inferMediaType(streamUrl: string): RadioStream['mediaType'] {
  const normalizedUrl = streamUrl.toLowerCase();

  if (normalizedUrl.includes('.m3u8')) return 'hls';
  if (normalizedUrl.includes('.aac') || normalizedUrl.includes('.aacp')) return 'aac';
  if (normalizedUrl.includes('.ogg') || normalizedUrl.includes('.opus')) return 'ogg';
  if (normalizedUrl.includes('.pls') || normalizedUrl.includes('.m3u')) return 'html';
  if (normalizedUrl.includes('.mp3')) return 'mp3';

  return 'mp3';
}

export async function resolveCustomStreamUrl(streamUrl: string): Promise<RadioStream> {
  const normalizedUrl = normalizeStreamUrl(streamUrl);
  const lowered = normalizedUrl.toLowerCase();

  if (lowered.includes('.pls')) {
    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch PLS stream');
    }

    const text = await response.text();
    const match = text.match(/^File\d+=(.+)$/im);

    if (!match) {
      throw new Error('No playable stream found in PLS file');
    }

    const resolvedUrl = new URL(match[1].trim(), normalizedUrl).toString();
    return {
      url: resolvedUrl,
      mediaType: inferMediaType(resolvedUrl),
      isDirect: true,
    };
  }

  if (lowered.includes('.m3u') && !lowered.includes('.m3u8')) {
    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch M3U stream');
    }

    const text = await response.text();
    const firstPlayableLine = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));

    if (!firstPlayableLine) {
      throw new Error('No playable stream found in M3U file');
    }

    const resolvedUrl = new URL(firstPlayableLine, normalizedUrl).toString();
    return {
      url: resolvedUrl,
      mediaType: inferMediaType(resolvedUrl),
      isDirect: true,
    };
  }

  return {
    url: normalizedUrl,
    mediaType: inferMediaType(normalizedUrl),
    isDirect: true,
  };
}
