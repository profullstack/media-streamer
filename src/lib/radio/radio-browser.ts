import type { RadioSearchParams, RadioStation, RadioStream } from './types';
import { RADIO_BROWSER_STATION_ID_PREFIX, inferMediaType } from './station-utils';

const RADIO_BROWSER_BASE_URL = 'https://all.api.radio-browser.info/json';
const RADIO_BROWSER_USER_AGENT = 'bittorrented-radio/1.0';

interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  tags?: string;
  country?: string;
  state?: string;
  clickcount?: number;
  codec?: string;
  bitrate?: number;
  hls?: number;
  lastcheckok?: number;
}

function buildRadioBrowserId(stationUuid: string): string {
  return `${RADIO_BROWSER_STATION_ID_PREFIX}${stationUuid}`;
}

function parseRadioBrowserId(stationId: string): string | null {
  if (!stationId.startsWith(RADIO_BROWSER_STATION_ID_PREFIX)) {
    return null;
  }

  const stationUuid = stationId.slice(RADIO_BROWSER_STATION_ID_PREFIX.length).trim();
  return stationUuid || null;
}

function summarizeTags(tags?: string): string | undefined {
  if (!tags) return undefined;

  const uniqueTags = Array.from(new Set(
    tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  ));

  return uniqueTags.slice(0, 2).join(', ') || undefined;
}

function buildDescription(station: RadioBrowserStation): string | undefined {
  const locationParts = [station.state?.trim(), station.country?.trim()].filter(Boolean);
  return locationParts.length > 0 ? locationParts.join(', ') : undefined;
}

function toRadioStation(station: RadioBrowserStation): RadioStation {
  return {
    id: buildRadioBrowserId(station.stationuuid),
    name: station.name.trim(),
    description: buildDescription(station),
    imageUrl: station.favicon?.trim() || undefined,
    genre: summarizeTags(station.tags),
    reliability: typeof station.clickcount === 'number' ? station.clickcount : undefined,
  };
}

async function radioBrowserFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${RADIO_BROWSER_BASE_URL}${path}`, {
    headers: {
      'User-Agent': RADIO_BROWSER_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Radio Browser request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface RadioBrowserService {
  search(params: RadioSearchParams): Promise<RadioStation[]>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;
  getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;
}

export function createRadioBrowserService(): RadioBrowserService {
  return {
    async search(params: RadioSearchParams): Promise<RadioStation[]> {
      const query = params.query.trim();
      if (!query) {
        return [];
      }

      try {
        const searchParams = new URLSearchParams({
          name: query,
          hidebroken: 'true',
          order: 'clickcount',
          reverse: 'true',
          limit: String(params.limit ?? 50),
        });

        const stations = await radioBrowserFetch<RadioBrowserStation[]>(`/stations/search?${searchParams.toString()}`);
        return stations.map(toRadioStation);
      } catch (error) {
        console.error('[RadioBrowser] Search error:', error);
        return [];
      }
    },

    async getPopularStations(genre?: string): Promise<RadioStation[]> {
      try {
        if (genre?.trim()) {
          const searchParams = new URLSearchParams({
            tag: genre.trim(),
            hidebroken: 'true',
            order: 'clickcount',
            reverse: 'true',
            limit: '20',
          });
          const stations = await radioBrowserFetch<RadioBrowserStation[]>(`/stations/search?${searchParams.toString()}`);
          return stations.map(toRadioStation);
        }

        const stations = await radioBrowserFetch<RadioBrowserStation[]>('/stations/topclick/20');
        return stations.map(toRadioStation);
      } catch (error) {
        console.error('[RadioBrowser] Popular stations error:', error);
        return [];
      }
    },

    async getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }> {
      const stationUuid = parseRadioBrowserId(stationId);
      if (!stationUuid) {
        return { streams: [], preferred: null };
      }

      try {
        const [clickData, stationInfo] = await Promise.all([
          radioBrowserFetch<{ url?: string }>(`/url/${stationUuid}`),
          radioBrowserFetch<RadioBrowserStation[]>(`/stations/byuuid?uuids=${stationUuid}`),
        ]);

        const station = stationInfo[0];
        const streamUrl = clickData.url || station?.url_resolved || station?.url;
        if (!streamUrl) {
          return { streams: [], preferred: null };
        }

        const stream: RadioStream = {
          url: streamUrl,
          mediaType: station?.hls ? 'hls' : inferMediaType(streamUrl),
          bitrate: station?.bitrate,
          isDirect: true,
        };

        return {
          streams: [stream],
          preferred: stream,
        };
      } catch (error) {
        console.error('[RadioBrowser] Stream error:', error);
        return { streams: [], preferred: null };
      }
    },

    async getStationInfo(stationId: string): Promise<RadioStation | null> {
      const stationUuid = parseRadioBrowserId(stationId);
      if (!stationUuid) {
        return null;
      }

      try {
        const stations = await radioBrowserFetch<RadioBrowserStation[]>(`/stations/byuuid?uuids=${stationUuid}`);
        return stations[0] ? toRadioStation(stations[0]) : null;
      } catch (error) {
        console.error('[RadioBrowser] Station info error:', error);
        return null;
      }
    },
  };
}
