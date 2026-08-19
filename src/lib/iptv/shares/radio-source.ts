/**
 * The SiriusXM side of a resale share.
 *
 * An IPTV share sells a playlist: every channel already has a durable URL, so the
 * resale machinery can treat it as a lookup table. A SiriusXM share cannot work
 * that way, and the difference is the whole reason this file exists.
 *
 *   - There is no per-channel URL to hand out. Playback is a *tune*: a short-lived,
 *     signed manifest URL minted on demand and tied to the session that asked for
 *     it. So a share's channel list stores a reference (`sxm:<type>:<id>`), and the
 *     real URL is resolved at stream time.
 *   - Every request upstream needs the owner's bearer token, and SiriusXM pins a
 *     session to the IP that authenticated it. All of it therefore runs inside
 *     `withSiriusXmUser(ownerId)` and through the owner's residential proxy.
 *   - A buyer never receives a session. They pick a channel and we play it to them;
 *     what they get back is our URL, holding our ciphertext.
 *
 * The last point is a constraint, not a preference: handing a buyer an SXM session
 * would let them use the owner's subscription anywhere, forever, and there is no
 * revoking it short of the owner changing their password.
 *
 * Concurrency is the other half. One account serving several listeners must still
 * look like one account listening, so tune URLs and the bytes behind them are both
 * deduplicated -- see `sharedFetch` in upstream-cache.ts.
 */

import { getSiriusXmProxyAgent, withSiriusXmUser } from '@/lib/radio/siriusxm-auth';
import {
  decodeSiriusXmKeyJson,
  getSiriusXmTuneUrl,
  getSiriusXmService,
  parseSiriusXmId,
  siriusXmHeaders,
  SIRIUSXM_STATION_ID_PREFIX,
} from '@/lib/radio';
import { proxyFetch } from '@/lib/radio/proxy-fetch';
import type { Channel } from '@/lib/iptv/m3u-parser';
import { sharedFetch } from './upstream-cache';

/** A tune URL is good for a few minutes; re-tuning per request would be an upstream hit per listener. */
const TUNE_TTL_MS = 60_000;

interface TuneEntry {
  url: string;
  expiresAt: number;
}

const tuneCache = new Map<string, TuneEntry>();
const tuneInFlight = new Map<string, Promise<string>>();

/** True for a channel whose `url` is an SXM reference rather than a real stream. */
export function isRadioRef(url: string): boolean {
  return url.startsWith(SIRIUSXM_STATION_ID_PREFIX);
}

/**
 * The channels a radio share can sell.
 *
 * Sports and news only. The owner is reselling access to live play-by-play, and the
 * music channels carry licensing that a personal subscription plainly does not
 * extend to a paying third party.
 */
export async function listRadioChannels(ownerUserId: string): Promise<Channel[]> {
  const service = getSiriusXmService();
  const [sports, news] = await withSiriusXmUser(ownerUserId, async () =>
    Promise.all([
      service.getCategoryStations('sports').catch(() => []),
      service.getCategoryStations('news').catch(() => []),
    ]),
  );

  // A station carries no category of its own, so the grouping comes from which
  // list it arrived in. Sports wins a tie: a channel in both is a sports channel
  // to someone renting a line to hear a game.
  const seen = new Set<string>();
  const channels: Channel[] = [];
  for (const [group, stations] of [
    ['Sports', sports],
    ['News & Talk', news],
  ] as const) {
    for (const station of stations) {
      if (seen.has(station.id)) continue;
      seen.add(station.id);
      channels.push({
        id: station.id,
        name: station.name,
        // The reference, not a stream. resolveRadioUpstream turns it into one.
        url: station.id,
        logo: station.imageUrl,
        group,
      });
    }
  }
  return channels;
}

/**
 * Turn a channel reference into a playable manifest URL.
 *
 * Deduplicated twice over: a cached tune is reused until it nears expiry, and
 * simultaneous first-time requests for one channel share a single tune call. Ten
 * listeners starting the same game produce one request to SiriusXM.
 */
export async function resolveRadioUpstream(ownerUserId: string, ref: string): Promise<string> {
  const parsed = parseSiriusXmId(ref);
  if (!parsed) throw new Error('Not a SiriusXM channel reference');

  const key = `${ownerUserId}:${ref}`;
  const hit = tuneCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const pending = tuneInFlight.get(key);
  if (pending) return pending;

  const promise = withSiriusXmUser(ownerUserId, async () => {
    const tune = await getSiriusXmTuneUrl(parsed.id, parsed.type);
    // Trust SiriusXM's own expiry when it gives one, minus a margin so a listener
    // never picks up a URL that dies mid-request.
    const validUntil = tune.validUntil ? Date.parse(tune.validUntil) : Number.NaN;
    const expiresAt = Number.isFinite(validUntil)
      ? Math.min(validUntil - 10_000, Date.now() + TUNE_TTL_MS)
      : Date.now() + TUNE_TTL_MS;
    tuneCache.set(key, { url: tune.url, expiresAt });
    return tune.url;
  });

  tuneInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    tuneInFlight.delete(key);
  }
}

export interface RadioFetchResult {
  body: ArrayBuffer;
  contentType: string | null;
  status: number;
}

/** Only ever reach SiriusXM itself. A sealed URL that points elsewhere is a bug or an attack. */
export function isSiriusXmUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('siriusxm.com');
  } catch {
    return false;
  }
}

/**
 * Fetch one manifest, segment or key on the owner's behalf.
 *
 * Goes through `sharedFetch`, so concurrent listeners on the same channel collapse
 * into a single upstream request — the point of restreaming rather than reselling
 * the session.
 */
export async function fetchRadioUpstream(
  ownerUserId: string,
  url: string,
): Promise<RadioFetchResult> {
  if (!isSiriusXmUrl(url)) throw new Error('Refusing to proxy a non-SiriusXM URL');

  const result = await sharedFetch(url, async () =>
    withSiriusXmUser(ownerUserId, async () => {
      const headers = await siriusXmHeaders({
        Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
      });
      const agent = getSiriusXmProxyAgent();
      const res = await proxyFetch(url, {
        headers,
        ...(agent ? { dispatcher: agent } : {}),
      } as RequestInit);

      // SiriusXM serves AES keys as JSON; a player needs the raw bytes.
      if (url.includes('/playback/key/v1/') && res.ok) {
        const bytes = decodeSiriusXmKeyJson(await res.json());
        const buf = new ArrayBuffer(bytes.length);
        new Uint8Array(buf).set(bytes);
        return { body: buf, contentType: 'application/octet-stream', status: 200 };
      }

      return {
        body: await res.arrayBuffer(),
        contentType: res.headers.get('content-type'),
        status: res.status,
      };
    }),
  );

  return { body: result.body, contentType: result.contentType, status: result.status };
}

/** Diagnostics: how many tune URLs are currently held. */
export function tuneCacheSize(): number {
  return tuneCache.size;
}

export function resetTuneCache(): void {
  tuneCache.clear();
  tuneInFlight.clear();
}
