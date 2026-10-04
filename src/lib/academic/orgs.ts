/**
 * Who is behind a dataset, from open registries.
 *
 * Academic Torrents says little about a dataset's publisher: a creator string
 * (usually author names) and whatever URLs the uploader put in the description
 * or the citation. Those URLs' domains are the strongest signal, and two open,
 * CC0 registries resolve a domain to an organisation:
 *
 *   - ROR (ror.org), the registry of research organisations, which indexes
 *     domains and carries Wikidata, GRID, ISNI and FundRef ids
 *   - Wikidata, by official website (P856), for companies and anything ROR
 *     lacks, with country, LEI (P1278) and OpenCorporates (P1320)
 *
 * File hosts are not publishers: a dataset on GitHub or archive.org says who
 * stores it, not who made it, so those domains are dropped before lookup.
 */

export interface Organization {
  name: string;
  /** The registrable domain the match came from. */
  domain: string;
  type?: string | null;
  country?: string | null;
  website?: string | null;
  wikidata?: string | null;
  ror?: string | null;
  lei?: string | null;
  opencorporates?: string | null;
  /** Which registry answered. */
  via: 'ror' | 'wikidata';
}

/** Hosting platforms and link shorteners: where files live, not who published them. */
const PLATFORMS = new Set([
  'academictorrents.com',
  'archive.org',
  'github.com',
  'githubusercontent.com',
  'github.io',
  'gitlab.com',
  'bitbucket.org',
  'google.com',
  'googleapis.com',
  'goo.gl',
  'dropbox.com',
  'box.com',
  'onedrive.live.com',
  'live.com',
  'mega.nz',
  'bit.ly',
  'doi.org',
  'dx.doi.org',
  'arxiv.org',
  'kaggle.com',
  'figshare.com',
  'zenodo.org',
  'huggingface.co',
  'youtube.com',
  'youtu.be',
  'creativecommons.org',
  'opendatacommons.org',
  'apache.org',
  'opensource.org',
  'sourceforge.net',
  'amazonaws.com',
  'cloudfront.net',
  'twitter.com',
  'x.com',
  'reddit.com',
  'medium.com',
  'researchgate.net',
  'semanticscholar.org',
  'paperswithcode.com',
  // Image hosts, wikis-for-hire and data repositories: they hold things, others made them.
  'imgur.com',
  'fandom.com',
  'mendeley.com',
  // Preprint servers and journal platforms host the paper about a dataset, not the dataset's publisher.
  'biorxiv.org',
  'medrxiv.org',
  'sciencedirect.com',
  'cell.com',
  'springer.com',
  'nature.com',
  'wiley.com',
  'tandfonline.com',
]);

/** Domains that are projects of one publisher, resolved as that publisher. */
const ALIASES: Record<string, string> = {
  'wikipedia.org': 'wikimediafoundation.org',
  'wikimedia.org': 'wikimediafoundation.org',
  'wiktionary.org': 'wikimediafoundation.org',
  'wikidata.org': 'wikimediafoundation.org',
  'wikisource.org': 'wikimediafoundation.org',
  'wikibooks.org': 'wikimediafoundation.org',
};

/** The domain whose owner publishes what `domain` serves. */
export function publisherOf(domain: string): string {
  return ALIASES[domain] ?? domain;
}

/** Second-level labels under which the registrable domain is three labels long. */
const TWO_PART_SUFFIX = /\.(ac|co|com|edu|gov|net|org|or|ne|go|gob|nic|res)\.[a-z]{2}$/;

export function registrableDomain(host: string): string | null {
  const h = host.toLowerCase().replace(/^\.+|\.+$/g, '').replace(/^www\./, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return null;
  const labels = h.split('.');
  const keep = TWO_PART_SUFFIX.test(h) ? 3 : 2;
  return labels.length <= keep ? h : labels.slice(-keep).join('.');
}

/** Candidate publisher domains from free text and URLs, platforms removed, in first-seen order. */
export function publisherDomains(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const [, host] of (text ?? '').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const registrable = registrableDomain(host);
      if (!registrable || PLATFORMS.has(registrable) || PLATFORMS.has(host.toLowerCase())) continue;
      const domain = publisherOf(registrable);
      if (!out.includes(domain)) out.push(domain);
    }
  }
  return out;
}

/** A tag-safe slug for an organisation name. */
export function orgSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const UA = 'bittorrented-dataset-mirror/1.0 (https://bittorrented.com; dataset publisher enrichment)';

interface RorItem {
  id: string;
  names?: { value: string; types: string[] }[];
  types?: string[];
  domains?: string[];
  locations?: { geonames_details?: { country_code?: string } }[];
  links?: { type: string; value: string }[];
  external_ids?: { type: string; preferred?: string | null; all?: string[] }[];
  relationships?: { type: string }[];
}

/**
 * The top-level research organisation that owns `domain`, from ROR. A domain
 * is often shared by an institution and its labs; the one with no parent wins.
 */
export async function rorLookup(domain: string): Promise<Organization | null> {
  const url = new URL('https://api.ror.org/v2/organizations');
  url.searchParams.set('query.advanced', `domains:${domain}`);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) return null;
  const items = ((await res.json()) as { items?: RorItem[] }).items ?? [];
  const exact = items.filter((o) => o.domains?.includes(domain));
  const top = exact.find((o) => !o.relationships?.some((r) => r.type === 'parent')) ?? exact[0];
  if (!top) return null;
  const ext = (type: string) => {
    const e = top.external_ids?.find((x) => x.type === type);
    return e?.preferred ?? e?.all?.[0] ?? null;
  };
  return {
    name: top.names?.find((n) => n.types.includes('ror_display'))?.value ?? top.names?.[0]?.value ?? domain,
    domain,
    type: top.types?.[0] ?? null,
    country: top.locations?.[0]?.geonames_details?.country_code ?? null,
    website: top.links?.find((l) => l.type === 'website')?.value ?? null,
    wikidata: ext('wikidata'),
    ror: top.id,
    via: 'ror',
  };
}

type SparqlRow = Record<string, { value: string } | undefined>;

async function sparql(query: string): Promise<SparqlRow[]> {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'user-agent': UA,
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`wikidata ${res.status}`);
  return ((await res.json()) as { results: { bindings: SparqlRow[] } }).results.bindings;
}

const QID = /^Q\d+$/;
const qid = (uri?: string) => uri?.split('/').pop() ?? null;

/** The organisation whose official website (P856) is on `domain`, from Wikidata. */
export async function wikidataByDomain(domain: string): Promise<Organization | null> {
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  const sites = ['http://', 'https://']
    .flatMap((s) => [`${s}${domain}`, `${s}www.${domain}`])
    .flatMap((u) => [`<${u}>`, `<${u}/>`])
    .join(' ');
  const rows = await sparql(
    // A journal or a data set can share the publisher's website; neither is the publisher.
    `SELECT ?item ?itemLabel WHERE { VALUES ?site { ${sites} } ?item wdt:P856 ?site . ` +
      'MINUS { ?item wdt:P31 wd:Q5633421 } MINUS { ?item wdt:P31 wd:Q737498 } MINUS { ?item wdt:P31 wd:Q1172284 } ' +
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } LIMIT 5'
  );
  const id = qid(rows[0]?.item?.value);
  if (!id || !QID.test(id)) return null;
  return { name: rows[0].itemLabel?.value ?? domain, domain, wikidata: id, via: 'wikidata' };
}

/** Country, type, website, LEI and OpenCorporates id for one Wikidata organisation. */
export async function wikidataDetails(id: string): Promise<Partial<Organization>> {
  if (!QID.test(id)) return {};
  const rows = await sparql(
    `SELECT ?itemLabel ?countryCode ?typeLabel ?lei ?oc ?site WHERE { BIND(wd:${id} AS ?item) ` +
      'OPTIONAL { ?item wdt:P17 ?c . ?c wdt:P297 ?countryCode . } OPTIONAL { ?item wdt:P31 ?type . } ' +
      'OPTIONAL { ?item wdt:P1278 ?lei . } OPTIONAL { ?item wdt:P1320 ?oc . } OPTIONAL { ?item wdt:P856 ?site . } ' +
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } LIMIT 20'
  );
  const first = (k: string) => rows.find((r) => r[k]?.value)?.[k]?.value ?? null;
  const label = first('itemLabel');
  return {
    ...(label && !QID.test(label) ? { name: label } : {}),
    country: first('countryCode'),
    type: first('typeLabel'),
    lei: first('lei'),
    opencorporates: first('oc'),
    website: first('site'),
  };
}

/** ROR first, Wikidata second; then country, LEI and OpenCorporates from Wikidata. */
export async function resolveDomain(domain: string): Promise<Organization | null> {
  const org = (await rorLookup(domain).catch(() => null)) ?? (await wikidataByDomain(domain).catch(() => null));
  if (!org?.wikidata) return org;
  const extra = await wikidataDetails(org.wikidata).catch(() => ({}) as Partial<Organization>);
  // A person's homepage resolves to the person; that is a creator, not a publishing organisation.
  if (extra.type === 'human') return null;
  return {
    ...org,
    // Wikidata's label search sometimes returns the bare id when English has no label.
    name: QID.test(org.name) ? (extra.name ?? org.name) : org.name,
    country: org.country ?? extra.country ?? null,
    type: org.type ?? extra.type ?? null,
    website: org.website ?? extra.website ?? null,
    lei: extra.lei ?? null,
    opencorporates: extra.opencorporates ?? null,
  };
}
