/**
 * Servers a seedbox user would want, from r4ck.dev.
 *
 * A seedbox here is the member's own box, and the first question is always "which box".
 * r4ck.dev is our server search engine (every VPS, storage box and dedicated server for
 * sale, with the provider's own price), so this asks it the question a seedbox owner
 * asks: the most disk for the money, on a line fast enough to seed from.
 *
 * r4ck's catalogue is wide, and a raw "most disk, cheapest first" list leads with rows
 * nobody can use: sold out, shared web hosting sold by the gigabyte, a 10 Mbit line, a
 * price too good to be a real disk. `usable` is the difference between a search result
 * and a recommendation. Every link goes to the offer's page on r4ck.dev, never straight
 * to the provider: r4ck shows the price history and the alternatives, and it is the
 * thing we are promoting.
 *
 * Read through r4ck's public API (no key: 300 requests an hour) and cached here for an
 * hour, so a member opening the page never waits on it and never spends that allowance.
 */

const R4CK_ORIGIN = 'https://r4ck.dev';
const CACHE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export interface OfferPreset {
  key: string;
  label: string;
  blurb: string;
  /** r4ck search parameters, the same ones its page and API take. */
  query: Record<string, string>;
}

const KINDS = 'dedicated,bare-metal,vps,storage';

export const OFFER_PRESETS: OfferPreset[] = [
  {
    key: 'big',
    label: '2 TB and up',
    blurb: 'Room for a real library, cheapest first.',
    query: { min_disk: '2000', kind: KINDS, sort: 'price' },
  },
  {
    key: 'huge',
    label: '8 TB and up',
    blurb: 'Dedicated servers with big disks.',
    query: { min_disk: '8000', kind: 'dedicated,bare-metal,storage', sort: 'price' },
  },
  {
    key: 'starter',
    label: 'Under $10 a month',
    blurb: 'A first box: 500 GB or more for the price of a coffee.',
    query: { min_disk: '500', max_price: '10', kind: 'vps,storage', sort: 'price' },
  },
];

export interface ServerOffer {
  id: number;
  name: string;
  provider: string;
  kind: string;
  diskGb: number;
  diskType: string | null;
  vcpu: number | null;
  ramGb: number | null;
  bandwidthMbps: number | null;
  transferGb: number | null;
  monthlyUsd: number;
  usdPerTb: number;
  countries: string[];
  inStock: boolean;
  /** The offer on r4ck.dev. */
  url: string;
}

export interface OfferList {
  preset: OfferPreset;
  offers: ServerOffer[];
  /** The same search on r4ck.dev, for "see all". */
  browseUrl: string;
  fetchedAt: string;
}

interface R4ckServer {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  stock?: unknown;
  page?: unknown;
  provider?: { name?: unknown; slug?: unknown };
  compute?: { vcpu?: unknown; ram_gb?: unknown };
  storage?: { disk_gb?: unknown; type?: unknown };
  network?: { bandwidth_mbps?: unknown; transfer_gb?: unknown };
  price?: { monthly_usd?: unknown };
  location?: { countries?: unknown };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Tag a link so r4ck can see the visit came from here. */
export function withRef(url: string): string {
  try {
    const u = new URL(url);
    if (u.origin !== R4CK_ORIGIN) return `${R4CK_ORIGIN}/servers?ref=bittorrented`;
    u.searchParams.set('ref', 'bittorrented');
    return u.toString();
  } catch {
    return `${R4CK_ORIGIN}/servers?ref=bittorrented`;
  }
}

export function browseUrl(preset: OfferPreset): string {
  const u = new URL(`${R4CK_ORIGIN}/servers`);
  for (const [k, v] of Object.entries(preset.query)) u.searchParams.set(k, v);
  u.searchParams.set('ref', 'bittorrented');
  return u.toString();
}

/**
 * One r4ck row as an offer worth showing, or null.
 *
 * Dropped: no price or no disk; sold out (`out_of_stock`, or a storefront name that says
 * "0 Available"); shared web hosting, which has no shell to run anything on; a line of
 * 10 Mbit or less; and a price under 50 cents a terabyte, which in this catalogue is a
 * misread row, not a bargain.
 */
export function usable(row: R4ckServer): ServerOffer | null {
  const id = num(row.id);
  const name = str(row.name);
  const provider = str(row.provider?.name);
  const diskGb = num(row.storage?.disk_gb);
  const monthlyUsd = num(row.price?.monthly_usd);
  const page = str(row.page);
  if (id === null || !name || !provider || !diskGb || !monthlyUsd || monthlyUsd <= 0 || !page) return null;
  if (row.stock === 'out_of_stock' || row.stock === 'discontinued') return null;
  if (/\b0 available\b/i.test(name) || /shared hosting/i.test(name)) return null;
  const bandwidthMbps = num(row.network?.bandwidth_mbps);
  if (bandwidthMbps !== null && bandwidthMbps <= 10) return null;
  const usdPerTb = monthlyUsd / (diskGb / 1000);
  if (usdPerTb < 0.5) return null;
  const countries = Array.isArray(row.location?.countries)
    ? (row.location.countries as { code?: unknown }[]).map((c) => str(c?.code)).filter((c): c is string => c !== null)
    : [];
  return {
    id,
    name: name.slice(0, 80),
    provider: provider.slice(0, 60),
    kind: str(row.kind) ?? 'server',
    diskGb,
    diskType: str(row.storage?.type),
    vcpu: num(row.compute?.vcpu),
    ramGb: num(row.compute?.ram_gb),
    bandwidthMbps,
    transferGb: num(row.network?.transfer_gb),
    monthlyUsd: Math.round(monthlyUsd * 100) / 100,
    usdPerTb: Math.round(usdPerTb * 100) / 100,
    countries: countries.slice(0, 6),
    inStock: row.stock === 'in_stock',
    url: withRef(page),
  };
}

/**
 * The rows to show: usable ones, cheapest first, at most two from any one provider and
 * never the same plan twice (r4ck lists a plan once per location), so six rows are six
 * choices rather than one provider's price list.
 */
export function pickOffers(rows: R4ckServer[], limit = 6): ServerOffer[] {
  const perProvider = new Map<string, number>();
  const seen = new Set<string>();
  const out: ServerOffer[] = [];
  const offers = rows.map(usable).filter((o): o is ServerOffer => o !== null);
  offers.sort((a, b) => a.monthlyUsd - b.monthlyUsd);
  for (const offer of offers) {
    const plan = `${offer.provider}|${offer.name}|${offer.diskGb}`;
    if (seen.has(plan)) continue;
    const count = perProvider.get(offer.provider) ?? 0;
    if (count >= 2) continue;
    seen.add(plan);
    perProvider.set(offer.provider, count + 1);
    out.push(offer);
    if (out.length >= limit) break;
  }
  return out;
}

const cache = new Map<string, { list: OfferList; until: number }>();

export function presetFor(key: string | null | undefined): OfferPreset {
  return OFFER_PRESETS.find((p) => p.key === key) ?? OFFER_PRESETS[0]!;
}

/**
 * Offers for a preset. A failed read answers the last good list when there is one and an
 * empty list otherwise: the panel is a suggestion, and a page must not break because a
 * search engine was slow.
 */
export async function getOffers(presetKey: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<OfferList> {
  const preset = presetFor(presetKey);
  const hit = cache.get(preset.key);
  if (hit && hit.until > Date.now()) return hit.list;

  const url = new URL(`${R4CK_ORIGIN}/api/v1/search`);
  for (const [k, v] of Object.entries(preset.query)) url.searchParams.set(k, v);
  // The anonymous page size. Filtering drops a good share, so ask for all of it.
  url.searchParams.set('limit', '50');

  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'bittorrented.com seedbox offers (+https://bittorrented.com)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`r4ck answered ${res.status}`);
    const body = (await res.json()) as { servers?: unknown };
    const rows = Array.isArray(body.servers) ? (body.servers as R4ckServer[]) : [];
    const list: OfferList = {
      preset,
      offers: pickOffers(rows),
      browseUrl: browseUrl(preset),
      fetchedAt: new Date().toISOString(),
    };
    // An empty answer is remembered only briefly: it is more likely a bad read than the truth.
    cache.set(preset.key, { list, until: Date.now() + (list.offers.length > 0 ? CACHE_MS : 5 * 60 * 1000) });
    return list;
  } catch {
    if (hit) return hit.list;
    return { preset, offers: [], browseUrl: browseUrl(preset), fetchedAt: new Date().toISOString() };
  }
}

/** For tests. */
export function clearOfferCache(): void {
  cache.clear();
}
