/**
 * Where an advert for a break comes from.
 *
 * bittorrented decides nothing about which advert plays and records nothing
 * about it playing. Both belong to the ad network: it runs the auction and
 * meters the impression, and a second opinion here would be a second set of
 * numbers. This is a proxy with an opinion about failure, nothing more.
 *
 * The opinion is that a break nobody can fill does not happen. The player
 * treats anything without a url as "no advert" and keeps the station playing,
 * which is the only behaviour worth defaulting to when the alternative is dead
 * air on something live.
 */

/** The network's break endpoint. Overridable so a deployment can point elsewhere. */
const AD_ORIGIN = process.env.AD_ORIGIN ?? 'https://crawlproof.com';

/**
 * This property's slot at the network.
 *
 * Unset means adverts are off — the right default for a development copy, which
 * has no advertising relationship and should not spend a request per break
 * being told so.
 */
/**
 * bittorrented's own slot at the network.
 *
 * Defaulted in code rather than left to the environment, because it is not a
 * secret: the browser sends it on every break, so it is already public, and a
 * property's own slot is no more configuration than its own domain is. The
 * droplet deploy writes .env from one opaque GitHub secret, so leaving it to
 * the environment meant nobody could add it without rewriting that whole blob
 * blind — a secret cannot be read back to append to safely.
 *
 * AD_SLOT still overrides, which is what a staging copy pointing at a test slot
 * would use. Setting it to an empty string turns adverts off.
 */
const DEFAULT_AD_SLOT = 'a60770cc-ab90-46f5-943d-a820583202cb';

const AD_SLOT = process.env.AD_SLOT ?? DEFAULT_AD_SLOT;

/**
 * How long to wait.
 *
 * A break is a gap in a live stream, so the budget is what a listener will not
 * notice. Past it the advert is not worth having: the player falls back to the
 * stream, which beats a pause while a third party thinks about it.
 */
const TIMEOUT_MS = 1500;

export type Advert = { url: string; kind: 'audio' | 'video' } | { url: null };

/** No advert. The shape the player expects, not an error. */
const NONE: Advert = { url: null };

export async function nextAdvert(
  kindParam: string | null,
  deps: { fetchImpl?: typeof fetch; origin?: string; slot?: string } = {},
): Promise<Advert> {
  const slot = deps.slot ?? AD_SLOT;
  if (!slot) return NONE;

  // Audio unless a caller says otherwise: the radio modal is audio-only and
  // has nowhere to put a picture.
  const kind = kindParam === 'video' ? 'video' : 'audio';
  const doFetch = deps.fetchImpl ?? fetch;
  const origin = deps.origin ?? AD_ORIGIN;

  try {
    const res = await doFetch(
      `${origin}/api/ads/stream?slot=${encodeURIComponent(slot)}&kind=${kind}`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return NONE;

    const body = (await res.json()) as { url?: unknown; kind?: unknown };
    // Only https, and only a real string. This url is handed to a media element
    // in somebody's browser, so a javascript: or data: value arriving from the
    // network must not survive being proxied through here.
    if (typeof body.url !== 'string') return NONE;
    let parsed: URL;
    try {
      parsed = new URL(body.url);
    } catch {
      return NONE;
    }
    if (parsed.protocol !== 'https:') return NONE;

    return { url: parsed.toString(), kind: body.kind === 'video' ? 'video' : 'audio' };
  } catch {
    // A timeout, a refused connection, malformed JSON. All the same answer.
    return NONE;
  }
}
