/**
 * Which Academic Torrents datasets we may sell access to.
 *
 * Academic Torrents is a tracker, not a rights holder: every entry keeps the
 * licence its uploader gave it, and that licence alone decides whether a paid
 * mirror is allowed. The site publishes it per entry as `window.detailsLicense`
 * with a `canonical` SPDX-style id and a `confidence`; this module turns that
 * into one of four verdicts.
 *
 *   - public-domain  sell freely (CC0, PDDL, US government works)
 *   - attribution    sell, crediting the source (CC-BY, ODC-By, MIT, Apache, BSD)
 *   - share-alike    sell, but the buyer may re-share it free under the same
 *                    licence, so it cannot be locked down (CC-BY-SA, ODbL, GPL)
 *   - no             never sell: non-commercial, research-only, unknown, or a
 *                    licence the site itself was not sure about
 *
 * Anything this module does not recognise is `no`. A false "no" costs one
 * dataset; a false "yes" is statutory damages per work.
 */

export type LicenseVerdict = 'public-domain' | 'attribution' | 'share-alike' | 'no';

/** The OpenFile `attestation.basis` a sellable verdict is published under. */
export type OpenFileBasis = 'public-domain' | 'open-license';

/** What academictorrents.com embeds in each details page. */
export interface AcademicLicense {
  raw?: string | null;
  label?: string | null;
  canonical?: string | null;
  confidence?: string | null;
}

export interface LicenseDecision {
  verdict: LicenseVerdict;
  /** The SPDX id as published, or null when there was none. */
  spdx: string | null;
  /** One line a reviewer can read beside the dataset. */
  reason: string;
}

const PUBLIC_DOMAIN = /^(CC0-1\.0|PDDL-1\.0|public[- ]?domain|US-?Gov(ernment)?(-Work)?|Unlicense)$/i;
const NON_COMMERCIAL = /(^|-)NC(-|$)|non-?commercial|research|academic|personal/i;
const SHARE_ALIKE = /^(CC-BY(-ND)?-SA-[\d.]+|ODbL-1\.0|GPL-[\d.]+(-only|-or-later)?|LGPL-[\d.]+.*|AGPL-[\d.]+.*|CDLA-Sharing-1\.0|GFDL-[\d.]+.*)$/i;
const ATTRIBUTION = /^(CC-BY-[\d.]+|CC-BY-ND-[\d.]+|ODC-By-1\.0|MIT|Apache-2\.0|BSD-[23]-Clause|ISC|CDLA-Permissive-[\d.]+|OGL-UK-3\.0)$/i;

/**
 * Uploaders often paste a licence URL the site cannot name, which it then
 * reports with no canonical id and medium confidence. A raw value that is
 * exactly one of these URLs is unambiguous; anything with text around it is not.
 */
function spdxFromUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
  if (!url) return null;
  if (url === 'apache.org/licenses/license-2.0' || url === 'apache.org/licenses/license-2.0.html') return 'Apache-2.0';
  if (url === 'opensource.org/licenses/mit') return 'MIT';
  if (url === 'opendatacommons.org/licenses/odbl/1-0' || url === 'opendatacommons.org/licenses/odbl/1.0') return 'ODbL-1.0';
  if (url === 'opendatacommons.org/licenses/by/1-0' || url === 'opendatacommons.org/licenses/by/1.0') return 'ODC-By-1.0';
  if (url === 'creativecommons.org/publicdomain/zero/1.0') return 'CC0-1.0';
  const cc = url.match(/^creativecommons\.org\/licenses\/(by(?:-nc)?(?:-nd|-sa)?)\/(\d\.\d)$/);
  return cc ? `CC-${cc[1].toUpperCase()}-${cc[2]}` : null;
}

export function decideLicense(license: AcademicLicense | null | undefined): LicenseDecision {
  const fromUrl = license?.canonical?.trim() ? null : spdxFromUrl(license?.raw);
  if (fromUrl) return decideLicense({ canonical: fromUrl, confidence: 'high' });
  const spdx = license?.canonical?.trim() || null;
  if (!spdx) return { verdict: 'no', spdx: null, reason: 'no licence stated' };
  if (license?.confidence && license.confidence !== 'high') {
    return { verdict: 'no', spdx, reason: `licence detected with ${license.confidence} confidence; review by hand` };
  }
  // NC is checked first: CC-BY-NC-SA would otherwise match the share-alike rule.
  if (NON_COMMERCIAL.test(spdx)) return { verdict: 'no', spdx, reason: 'non-commercial or research-only' };
  if (PUBLIC_DOMAIN.test(spdx)) return { verdict: 'public-domain', spdx, reason: 'public domain' };
  if (SHARE_ALIKE.test(spdx)) return { verdict: 'share-alike', spdx, reason: 'sellable; buyers may re-share under the same licence' };
  if (ATTRIBUTION.test(spdx)) {
    const nd = /-ND-/i.test(spdx) ? '; verbatim copies only, no derivatives' : '';
    return { verdict: 'attribution', spdx, reason: `sellable with credit to the source${nd}` };
  }
  return { verdict: 'no', spdx, reason: 'licence not on the sellable list' };
}

export function isSellable(verdict: LicenseVerdict): boolean {
  return verdict !== 'no';
}

export function openFileBasis(verdict: LicenseVerdict): OpenFileBasis | null {
  if (verdict === 'public-domain') return 'public-domain';
  if (verdict === 'attribution' || verdict === 'share-alike') return 'open-license';
  return null;
}
