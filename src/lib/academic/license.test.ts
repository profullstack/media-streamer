import { describe, expect, it } from 'vitest';
import { decideLicense, isSellable, openFileBasis } from './license';

const high = (canonical: string) => ({ canonical, confidence: 'high' });

describe('decideLicense', () => {
  it('sells public-domain data freely', () => {
    expect(decideLicense(high('CC0-1.0')).verdict).toBe('public-domain');
    expect(decideLicense(high('PDDL-1.0')).verdict).toBe('public-domain');
  });

  it('sells attribution licences with credit', () => {
    expect(decideLicense(high('CC-BY-4.0')).verdict).toBe('attribution');
    expect(decideLicense(high('MIT')).verdict).toBe('attribution');
    expect(decideLicense(high('ODC-By-1.0')).verdict).toBe('attribution');
  });

  it('marks no-derivatives as verbatim only', () => {
    const d = decideLicense(high('CC-BY-ND-4.0'));
    expect(d.verdict).toBe('attribution');
    expect(d.reason).toMatch(/verbatim/);
  });

  it('sells share-alike but says buyers can re-share', () => {
    expect(decideLicense(high('CC-BY-SA-4.0')).verdict).toBe('share-alike');
    expect(decideLicense(high('ODbL-1.0')).verdict).toBe('share-alike');
  });

  it('never sells non-commercial, even when share-alike', () => {
    // The MIT OpenCourseWare torrents on Academic Torrents are this licence.
    expect(decideLicense(high('CC-BY-NC-SA-4.0')).verdict).toBe('no');
    expect(decideLicense(high('CC-BY-NC-4.0')).verdict).toBe('no');
    expect(decideLicense(high('CC-BY-NC-ND-4.0')).verdict).toBe('no');
  });

  it('never sells unknown, missing or unsure licences', () => {
    expect(decideLicense(null).verdict).toBe('no');
    expect(decideLicense({ canonical: '' }).verdict).toBe('no');
    expect(decideLicense(high('Custom research licence')).verdict).toBe('no');
    expect(decideLicense(high('Some-New-Licence')).verdict).toBe('no');
    expect(decideLicense({ canonical: 'CC-BY-4.0', confidence: 'low' }).verdict).toBe('no');
  });
});

describe('decideLicense from a bare licence URL', () => {
  it('reads an exact well-known URL the site could not name', () => {
    const apache = { raw: 'https://www.apache.org/licenses/LICENSE-2.0', canonical: '', confidence: 'medium' };
    expect(decideLicense(apache)).toMatchObject({ verdict: 'attribution', spdx: 'Apache-2.0' });
    expect(decideLicense({ raw: 'https://creativecommons.org/licenses/by-sa/4.0/', canonical: '' }).verdict).toBe('share-alike');
    expect(decideLicense({ raw: 'https://creativecommons.org/licenses/by-nc/4.0/', canonical: '' }).verdict).toBe('no');
  });

  it('leaves anything with text around the URL for a human', () => {
    const wiki = { raw: 'CC BY-SA ( https://creativecommons.org/licenses/by-sa/4.0/ )', canonical: '', confidence: 'medium' };
    expect(decideLicense(wiki).verdict).toBe('no');
    expect(decideLicense({ raw: 'https://dumps.wikimedia.org/legal.html', canonical: '', confidence: 'medium' }).verdict).toBe('no');
  });
});

describe('openFileBasis', () => {
  it('maps sellable verdicts onto OpenFile attestation bases', () => {
    expect(openFileBasis('public-domain')).toBe('public-domain');
    expect(openFileBasis('attribution')).toBe('open-license');
    expect(openFileBasis('share-alike')).toBe('open-license');
    expect(openFileBasis('no')).toBeNull();
    expect(isSellable('no')).toBe(false);
  });
});
