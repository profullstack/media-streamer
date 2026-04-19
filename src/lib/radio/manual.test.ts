import { describe, expect, it } from 'vitest';
import { createManualRadioService } from './manual';

describe('Manual radio service', () => {
  const service = createManualRadioService();

  it('returns hardcoded stations for matching queries', async () => {
    const stations = await service.search({ query: 'kgmz', limit: 10 });

    expect(stations).toHaveLength(1);
    expect(stations[0]?.name).toBe('95.7 The Game');
  });

  it('returns stream information for a hardcoded station', async () => {
    const { streams, preferred } = await service.getStream('manual:973-the-fan');

    expect(streams).toHaveLength(1);
    expect(preferred?.url).toContain('audacy-kwfnfmaac-imc');
    expect(preferred?.mediaType).toBe('aac');
  });
});
