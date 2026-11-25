import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFER_PRESETS, browseUrl, clearOfferCache, getOffers, pickOffers, presetFor, usable, withRef } from './offers';

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'STKVM-4TB',
  kind: 'storage',
  stock: 'unknown',
  page: 'https://r4ck.dev/servers/1',
  provider: { name: 'LevelOneServers', slug: 'levelone' },
  compute: { vcpu: 2, ram_gb: 4 },
  storage: { disk_gb: 4096, type: 'hdd' },
  network: { bandwidth_mbps: 1000, transfer_gb: null },
  price: { monthly_usd: 17 },
  location: { countries: [{ code: 'US', name: 'United States' }] },
  ...over,
});

beforeEach(() => clearOfferCache());

describe('which r4ck rows are worth showing a seedbox owner', () => {
  it('keeps a real box and works out the price per terabyte', () => {
    const offer = usable(row());
    expect(offer).toMatchObject({
      provider: 'LevelOneServers',
      diskGb: 4096,
      monthlyUsd: 17,
      usdPerTb: 4.15,
      countries: ['US'],
      inStock: false,
      url: 'https://r4ck.dev/servers/1?ref=bittorrented',
    });
  });

  it('drops what nobody can use', () => {
    const dropped: [string, Record<string, unknown>][] = [
      ['sold out', { stock: 'out_of_stock' }],
      ['discontinued', { stock: 'discontinued' }],
      ['a storefront row that says none are left', { name: 'Promo Storage NY Power 0 Available' }],
      ['shared web hosting, which has no shell', { name: 'Shared Hosting Plan - Bigstorage H' }],
      ['a 10 Mbit line', { network: { bandwidth_mbps: 10 } }],
      ['a price too good to be a real disk', { storage: { disk_gb: 25600 }, price: { monthly_usd: 3 } }],
      ['no price', { price: { monthly_usd: null } }],
      ['no disk', { storage: { disk_gb: null } }],
      ['no page to link to', { page: null }],
    ];
    for (const [why, over] of dropped) expect(usable(row(over)), why).toBeNull();
  });

  it('keeps a box whose line speed the provider did not state', () => {
    expect(usable(row({ network: { bandwidth_mbps: null } }))).not.toBeNull();
  });

  it('shows six choices, not one provider six times or one plan per location', () => {
    const rows = [
      ...[1, 2, 3, 4].map((i) => row({ id: i, name: `KS-${i}`, provider: { name: 'Kimsufi' }, price: { monthly_usd: 10 + i } })),
      row({ id: 9, name: 'KS-1', provider: { name: 'Kimsufi' }, price: { monthly_usd: 11 } }), // KS-1 again, another location
      row({ id: 20, name: 'Big', provider: { name: 'Other' }, price: { monthly_usd: 30 } }),
    ];
    const picked = pickOffers(rows);
    expect(picked.map((o) => `${o.provider} ${o.name}`)).toEqual(['Kimsufi KS-1', 'Kimsufi KS-2', 'Other Big']);
  });
});

describe('links go to r4ck.dev', () => {
  it('tags the offer page and never follows a link somewhere else', () => {
    expect(withRef('https://r4ck.dev/servers/5')).toBe('https://r4ck.dev/servers/5?ref=bittorrented');
    expect(withRef('https://evil.test/servers/5')).toBe('https://r4ck.dev/servers?ref=bittorrented');
    expect(withRef('javascript:alert(1)')).toBe('https://r4ck.dev/servers?ref=bittorrented');
  });

  it('builds the same search on r4ck for "see all"', () => {
    const url = new URL(browseUrl(presetFor('big')));
    expect(url.origin + url.pathname).toBe('https://r4ck.dev/servers');
    expect(url.searchParams.get('min_disk')).toBe('2000');
    expect(url.searchParams.get('ref')).toBe('bittorrented');
  });

  it('falls back to the first preset for an unknown one', () => {
    expect(presetFor('nope').key).toBe(OFFER_PRESETS[0]?.key);
  });
});

describe('getOffers', () => {
  it('asks r4ck once and serves the rest from cache', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ servers: [row()] }));
    const first = await getOffers('big', fetchImpl as unknown as typeof fetch);
    const second = await getOffers('big', fetchImpl as unknown as typeof fetch);
    expect(first.offers).toHaveLength(1);
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const asked = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(asked.pathname).toBe('/api/v1/search');
    expect(asked.searchParams.get('min_disk')).toBe('2000');
  });

  it('answers an empty list, not an error, when r4ck is down', async () => {
    const down = vi.fn(async () => {
      throw new Error('timeout');
    });
    const list = await getOffers('huge', down as unknown as typeof fetch);
    expect(list.offers).toEqual([]);
    expect(list.browseUrl).toContain('https://r4ck.dev/servers');
  });
});
