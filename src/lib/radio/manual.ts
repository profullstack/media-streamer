import type { RadioSearchParams, RadioStation, RadioStream } from './types';
import { MANUAL_STATION_ID_PREFIX, inferMediaType } from './station-utils';

export interface ManualStationDefinition {
  id: string;
  name: string;
  description: string;
  genre: string;
  homepageUrl: string;
  streamUrl: string;
  mediaType?: RadioStream['mediaType'];
  aliases: string[];
}

const MANUAL_STATIONS: ManualStationDefinition[] = [
  {
    id: `${MANUAL_STATION_ID_PREFIX}957-the-game`,
    name: '95.7 The Game',
    description: 'Bay Area sports talk. Some live games may be geo-restricted.',
    genre: 'Sports',
    homepageUrl: 'https://www.audacy.com/957thegame',
    streamUrl: 'https://live.amperwave.net/direct/audacy-kgmzfmaac-imc',
    mediaType: 'aac',
    aliases: ['kgmz', 'bay area', 'golden state', 'warriors', '957 the game'],
  },
  {
    id: `${MANUAL_STATION_ID_PREFIX}973-the-fan`,
    name: '97.3 The Fan',
    description: 'San Diego sports talk. Some live games may be geo-restricted.',
    genre: 'Sports',
    homepageUrl: 'https://www.audacy.com/973thefansd',
    streamUrl: 'https://live.amperwave.net/direct/audacy-kwfnfmaac-imc',
    mediaType: 'aac',
    aliases: ['kwfn', 'san diego', 'padres', '973 the fan'],
  },
];

function toRadioStation(station: ManualStationDefinition): RadioStation {
  return {
    id: station.id,
    name: station.name,
    description: station.description,
    genre: station.genre,
  };
}

function matchesQuery(station: ManualStationDefinition, query: string): boolean {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return false;
  }

  const haystack = [
    station.name,
    station.description,
    station.genre,
    station.homepageUrl,
    ...station.aliases,
  ].join(' ').toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

export interface ManualRadioService {
  search(params: RadioSearchParams): Promise<RadioStation[]>;
  getPopularStations(): Promise<RadioStation[]>;
  getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;
}

export function createManualRadioService(): ManualRadioService {
  return {
    async search(params: RadioSearchParams): Promise<RadioStation[]> {
      const matchingStations = MANUAL_STATIONS
        .filter((station) => matchesQuery(station, params.query))
        .slice(0, params.limit ?? 50);

      return matchingStations.map(toRadioStation);
    },

    async getPopularStations(): Promise<RadioStation[]> {
      return MANUAL_STATIONS.map(toRadioStation);
    },

    async getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }> {
      const station = MANUAL_STATIONS.find((entry) => entry.id === stationId);
      if (!station) {
        return { streams: [], preferred: null };
      }

      const stream: RadioStream = {
        url: station.streamUrl,
        mediaType: station.mediaType ?? inferMediaType(station.streamUrl),
        isDirect: true,
      };

      return {
        streams: [stream],
        preferred: stream,
      };
    },

    async getStationInfo(stationId: string): Promise<RadioStation | null> {
      const station = MANUAL_STATIONS.find((entry) => entry.id === stationId);
      return station ? toRadioStation(station) : null;
    },
  };
}
