/**
 * The hub's arithmetic and its record rules.
 *
 * These are the parts that carry money and consent, so they are tested without
 * a database: canonical bytes and signatures, the four lanes, the 1 percent,
 * what a proven period earns, and a README renderer that must never emit HTML
 * somebody put in their own README.
 */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as signBytes } from 'node:crypto';
import {
  HUB_FEE_BPS,
  LANES,
  feeOn,
  laneFor,
  periodEarnings,
  requiredBudget,
  totalWithFee,
} from './lanes';
import { renderReadme, readmeSummary, escapeHtml } from './markdown';
import {
  canonicalize,
  canonicalBytes,
  fromMicros,
  isKey,
  recordId,
  signingMessage,
  signers,
  toMicros,
  usd,
  verifiedBy,
  type SignedRecord,
} from './records';

/* ------------------------------------------------------------- key fixtures */

function keypair(): { key: string; sign: (record: SignedRecord) => string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const key = `ed25519:${raw.toString('hex')}`;
  return {
    key,
    sign: (record) => signBytes(null, signingMessage(record.type, record), privateKey).toString('base64'),
  };
}

const record = (type: string, fields: Record<string, unknown>): SignedRecord =>
  ({ openswarm: '0.1', type, createdAt: '2026-09-06T00:00:00.000Z', ...fields, sigs: [] }) as SignedRecord;

/* ----------------------------------------------------------------- records */

describe('canonical form', () => {
  it('sorts keys and drops insignificant whitespace', () => {
    expect(canonicalize({ b: 1, a: 'x' })).toBe('{"a":"x","b":1}');
    expect(canonicalize([1, { z: true, y: null }])).toBe('[1,{"y":null,"z":true}]');
  });

  it('refuses a fractional number, because money is a string here', () => {
    // A float in the canonical bytes is exactly the ambiguity six-decimal
    // strings exist to avoid.
    expect(() => canonicalize({ amount: 0.1 })).toThrow(/fractional/);
  });

  it('computes the id over everything but the signatures', () => {
    const unsigned = record('pay2seed.attestation', { basis: 'own' });
    const signed = { ...unsigned, sigs: [{ alg: 'ed25519', key: 'ed25519:' + 'a'.repeat(64), sig: 'x' }] };
    expect(canonicalBytes(unsigned)).toBe(canonicalBytes(signed));
    expect(recordId(unsigned)).toBe(recordId(signed));
    expect(recordId(unsigned)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('signatures', () => {
  it('verifies a record signed by its key', () => {
    const alice = keypair();
    const draft = record('pay2seed.attestation', { requester: alice.key, basis: 'own' });
    const signed = { ...draft, sigs: [{ alg: 'ed25519', key: alice.key, sig: alice.sign(draft) }] };
    expect(verifiedBy(signed, alice.key)).toBe(true);
    expect(signers(signed)).toEqual([alice.key]);
  });

  it('refuses a signature from another key, and one over a changed body', () => {
    const alice = keypair();
    const mallory = keypair();
    const draft = record('pay2seed.attestation', { requester: alice.key, basis: 'own' });
    const signed = { ...draft, sigs: [{ alg: 'ed25519', key: alice.key, sig: alice.sign(draft) }] };

    expect(verifiedBy(signed, mallory.key)).toBe(false);
    // Editing the body after signing must not still verify.
    expect(verifiedBy({ ...signed, basis: 'licensed' } as SignedRecord, alice.key)).toBe(false);
  });

  it('will not let a signature be replayed as another record type', () => {
    // The domain prefix is the whole defence here: same body, different type.
    const alice = keypair();
    const draft = record('pay2seed.attestation', { amount: '1.000000' });
    const signature = alice.sign(draft);
    const asAttestation = { ...draft, sigs: [{ alg: 'ed25519', key: alice.key, sig: signature }] };
    const asReceipt = { ...draft, type: 'paid2seed.receipt', sigs: [{ alg: 'ed25519', key: alice.key, sig: signature }] };
    expect(verifiedBy(asAttestation, alice.key)).toBe(true);
    expect(verifiedBy(asReceipt as SignedRecord, alice.key)).toBe(false);
  });

  it('ignores an algorithm it does not implement rather than failing', () => {
    const alice = keypair();
    const draft = record('pay2seed.attestation', { basis: 'own' });
    const signed = {
      ...draft,
      sigs: [
        { alg: 'mldsa65', key: 'mldsa65:beef', sig: 'whatever' },
        { alg: 'ed25519', key: alice.key, sig: alice.sign(draft) },
      ],
    };
    expect(verifiedBy(signed, alice.key)).toBe(true);
  });

  it('knows a key when it sees one', () => {
    expect(isKey(`ed25519:${'a'.repeat(64)}`)).toBe(true);
    expect(isKey(`ed25519:${'A'.repeat(64)}`)).toBe(false);
    expect(isKey('ed25519:tooshort')).toBe(false);
    expect(isKey(42)).toBe(false);
  });
});

/* ------------------------------------------------------------------- money */

describe('money', () => {
  it('round-trips six-decimal strings through integer micros', () => {
    expect(toMicros('1.500000')).toBe(1_500_000n);
    expect(fromMicros(1_500_000n)).toBe('1.500000');
    expect(fromMicros(1n)).toBe('0.000001');
    expect(usd(0.1 + 0.2)).toBe('0.300000');
  });

  it('refuses an amount that is not exactly six decimals', () => {
    expect(() => toMicros('1.5')).toThrow();
    expect(() => toMicros('1')).toThrow();
  });
});

describe('the hub takes one percent', () => {
  it('is 100 basis points, rounded up to the micro', () => {
    expect(HUB_FEE_BPS).toBe(100);
    expect(feeOn('100.000000')).toBe('1.000000');
    expect(totalWithFee('100.000000')).toBe('101.000000');
    // Rounded up, so a fraction of a micro is never quietly the hub's loss.
    expect(feeOn('0.000050')).toBe('0.000001');
  });

  it('is charged on top, so a quoted budget is what reaches the seeders', () => {
    const budget = '12.000000';
    expect(totalWithFee(budget)).toBe('12.120000');
    // The budget itself is untouched: the fee is the payer's, not the seeder's.
    expect(budget).toBe('12.000000');
  });
});

describe('lanes', () => {
  it('carries all four, and names who pays whom', () => {
    expect(LANES).toEqual(['h2h', 'h2b', 'b2h', 'b2b']);
    expect(laneFor('human', 'human')).toBe('h2h');
    expect(laneFor('human', 'bit')).toBe('h2b');
    expect(laneFor('bit', 'human')).toBe('b2h');
    expect(laneFor('bit', 'bit')).toBe('b2b');
  });
});

describe('what a period earns', () => {
  const GIB = 1024 ** 3;

  it('is price × size × time, and a whole GiB-month is the price', () => {
    // One GiB, one month of six-hour periods: 120 periods make the full price.
    const perPeriod = periodEarnings({ priceUsdPerGibMonth: '0.150000', sizeBytes: GIB, everyHours: 6 });
    expect(perPeriod).toBe('0.001250');
    expect(toMicros(perPeriod) * 120n).toBe(toMicros('0.150000'));
  });

  it('rounds down, so a hub and a seeder computing it apart always agree', () => {
    const earned = periodEarnings({ priceUsdPerGibMonth: '0.000001', sizeBytes: 1, everyHours: 1 });
    expect(earned).toBe('0.000000');
  });

  it('escrows enough for every slot for the whole term, rounded up', () => {
    const budget = requiredBudget({ priceUsdPerGibMonth: '0.150000', sizeBytes: GIB, days: 30, seedersMax: 3 });
    expect(budget).toBe('0.450000');
    // A proven period can never exceed what was escrowed for it.
    const perPeriod = periodEarnings({ priceUsdPerGibMonth: '0.150000', sizeBytes: GIB, everyHours: 6 });
    expect(toMicros(perPeriod) * 120n * 3n).toBeLessThanOrEqual(toMicros(budget));
  });
});

/* ---------------------------------------------------------------- markdown */

describe('the README renderer', () => {
  it('renders the subset a listing needs', () => {
    const html = renderReadme('# Title\n\nA line with **bold** and `code`.\n\n- one\n- two\n');
    // A README's own h1 steps down, so the page keeps one h1 of its own.
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
  });

  it('renders GFM tables and fenced code', () => {
    const html = renderReadme('| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```sh\necho hi\n```');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<pre><code class="language-sh">echo hi</code></pre>');
  });

  it('never emits HTML somebody put in their own README', () => {
    const html = renderReadme('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    // The words survive as text; what must not survive is a tag or an
    // attribute, so assert on the markup rather than on the string.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('refuses a javascript: link and keeps a relative one', () => {
    const bad = renderReadme('[click](javascript:alert(1))');
    expect(bad).not.toContain('href="javascript');

    // A relative link resolves into the swarm and is gated as the file is.
    const relative = renderReadme('[the data](data/set.csv)');
    expect(relative).toContain('href="data/set.csv"');
    expect(relative).not.toContain('target="_blank"');

    // An absolute one leaves the site, so it is marked up as such.
    const absolute = renderReadme('[home](https://example.com)');
    expect(absolute).toContain('rel="noreferrer nofollow ugc"');
    expect(absolute).toContain('target="_blank"');
  });

  it('will not let a link climb out of the swarm', () => {
    expect(renderReadme('[up](../../etc/passwd)')).not.toContain('href="../');
  });

  it('summarises the first real line, skipping headings and fences', () => {
    expect(readmeSummary('# Heading\n\n```\ncode\n```\n\nThe actual summary.')).toBe('The actual summary.');
    expect(readmeSummary('# Only a heading')).toBe('');
  });

  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});
