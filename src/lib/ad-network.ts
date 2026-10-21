/**
 * ad.network publisher claim for the logged-out homepage (`/` answers 307 to
 * /invite-only). The homepage carries no ad unit, only the verification meta.
 *
 * Kept out of the 'use client' ad component so the server layout can read the
 * claim code as a plain string: every export of a client module reaches a
 * server component as a client reference, not its value.
 *
 * ad.network verifies the site by fetching the raw HTML of https://bittorrented.com/
 * and looking for the claim code in the <meta>.
 */
export const AD_NETWORK_CODE = 'S922XZBcQKUL3htm';
