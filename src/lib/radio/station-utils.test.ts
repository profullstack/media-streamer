import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCustomStationId,
  createCustomRadioStation,
  parseCustomStationId,
  resolveCustomStreamUrl,
} from './station-utils';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('radio station utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a custom station with a stable encoded id', () => {
    const station = createCustomRadioStation({
      streamUrl: 'https://stream.example.com/live.mp3',
    });

    expect(station.id).toBe(buildCustomStationId('https://stream.example.com/live.mp3'));
    expect(station.name).toBe('stream.example.com');
    expect(parseCustomStationId(station.id)).toBe('https://stream.example.com/live.mp3');
  });

  it('resolves PLS files to the first playable stream', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '[playlist]\nFile1=https://stream.example.com/live.aac\n',
    });

    const stream = await resolveCustomStreamUrl('https://example.com/radio.pls');

    expect(stream).toEqual({
      url: 'https://stream.example.com/live.aac',
      mediaType: 'aac',
      isDirect: true,
    });
  });
});
