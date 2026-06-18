/**
 * Tests for the Finviz fundamentals parser.
 *
 * Uses a trimmed fixture that mirrors the real quote-page markup
 * (table.snapshot-table2 with .snapshot-td-label / .snapshot-td-content cells
 * and .is-positive / .is-negative color spans, plus .quote_profile-bio).
 */

import { describe, it, expect, vi } from 'vitest';
import { parseFinvizSnapshot, getFinvizFundamentals } from './finviz';

const FIXTURE = `
<html><body>
<table class="js-snapshot-table snapshot-table2 screener_snapshot-table-body">
  <tr>
    <td class="snapshot-td2"><div class="snapshot-td-label">P/E</div></td>
    <td class="snapshot-td2"><div class="snapshot-td-content"><b>24.50</b></div></td>
    <td class="snapshot-td2"><div class="snapshot-td-label">Perf Year</div></td>
    <td class="snapshot-td2"><div class="snapshot-td-content"><b><span class="color-text is-positive">24.00%</span></b></div></td>
  </tr>
  <tr>
    <td class="snapshot-td2"><div class="snapshot-td-label">Perf Week</div></td>
    <td class="snapshot-td2"><div class="snapshot-td-content"><b><span class="color-text is-negative">-1.25%</span></b></div></td>
    <td class="snapshot-td2"><div class="snapshot-td-label">Beta</div></td>
    <td class="snapshot-td2"><div class="snapshot-td-content"><b>1.01</b></div></td>
  </tr>
  <tr>
    <td class="snapshot-td2"><div class="snapshot-td-label">Short Float</div></td>
    <td class="snapshot-td2"><div class="snapshot-td-content"><b>-</b></div></td>
  </tr>
</table>
<div class="quote_profile-bio">The fund seeks to provide investment results
  that correspond to the S&amp;P 500 Index.</div>
</body></html>
`;

describe('parseFinvizSnapshot', () => {
  it('extracts ordered label/value metrics with tone and description', () => {
    const result = parseFinvizSnapshot(FIXTURE, 'spy');
    expect(result).not.toBeNull();
    const f = result!;

    expect(f.symbol).toBe('SPY');
    expect(f.source).toBe('finviz');
    expect(typeof f.asOf).toBe('number');

    // Order is preserved; the "-" placeholder row is dropped.
    expect(f.metrics).toEqual([
      { label: 'P/E', value: '24.50', tone: null },
      { label: 'Perf Year', value: '24.00%', tone: 'positive' },
      { label: 'Perf Week', value: '-1.25%', tone: 'negative' },
      { label: 'Beta', value: '1.01', tone: null },
    ]);

    expect(f.description).toContain('S&P 500 Index');
    // Whitespace is collapsed.
    expect(f.description).not.toMatch(/\s{2,}/);
  });

  it('returns null when the snapshot table is missing', () => {
    expect(parseFinvizSnapshot('<html><body>no table</body></html>', 'SPY')).toBeNull();
  });
});

describe('getFinvizFundamentals', () => {
  it('sends a browser UA and parses the response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => FIXTURE,
    });

    const result = await getFinvizFundamentals('spy', { fetchFn });
    expect(result?.symbol).toBe('SPY');
    expect(result?.metrics.length).toBe(4);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('t=SPY');
    expect(init.headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('throws on a non-ok response (caller renders defensively)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '' });
    await expect(getFinvizFundamentals('SPY', { fetchFn })).rejects.toThrow(/403/);
  });
});
