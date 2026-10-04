import { describe, expect, it } from 'vitest';
import { orgSlug, publisherDomains, registrableDomain } from './orgs';

describe('registrableDomain', () => {
  it('keeps the organisation part of a host', () => {
    expect(registrableDomain('ocw.mit.edu')).toBe('mit.edu');
    expect(registrableDomain('www.cs.ox.ac.uk')).toBe('ox.ac.uk');
    expect(registrableDomain('data.gov.au')).toBe('data.gov.au');
    expect(registrableDomain('opendota.com')).toBe('opendota.com');
  });

  it('refuses things that are not hosts', () => {
    expect(registrableDomain('localhost')).toBeNull();
    expect(registrableDomain('192.168.0.1')).toBeNull();
  });
});

describe('publisherDomains', () => {
  it('drops file hosts and keeps publishers, once each', () => {
    const text =
      'Course at https://ocw.mit.edu/courses/x hosted at https://archive.org/details/y, code https://github.com/a/b, ' +
      'more at http://web.mit.edu/z and https://www.yasp.co/';
    expect(publisherDomains(text)).toEqual(['mit.edu', 'yasp.co']);
  });

  it('resolves a project to its publisher and ignores image hosts and paper venues', () => {
    const text = 'Dump of https://en.wikipedia.org/ and https://www.wikidata.org/, see https://i.imgur.com/x.jpg and https://www.biorxiv.org/y';
    expect(publisherDomains(text)).toEqual(['wikimediafoundation.org']);
  });

  it('reads several sources and tolerates missing ones', () => {
    expect(publisherDomains(null, 'https://stanford.edu/data', undefined)).toEqual(['stanford.edu']);
    expect(publisherDomains('no links here')).toEqual([]);
  });
});

describe('orgSlug', () => {
  it('makes a tag-safe slug', () => {
    expect(orgSlug('Massachusetts Institute of Technology')).toBe('massachusetts-institute-of-technology');
    expect(orgSlug('École Polytechnique Fédérale de Lausanne')).toBe('ecole-polytechnique-federale-de-lausanne');
  });
});
