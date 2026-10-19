/**
 * ad.network unit for the logged-out homepage (`/` answers 307 to /invite-only).
 *
 * Kept out of the 'use client' ad component so the server layout can read the
 * claim code as a plain string: every export of a client module reaches a
 * server component as a client reference, not its value.
 *
 * ad.network verifies the site by fetching the raw HTML of https://bittorrented.com/
 * and looking for the claim code, so it is rendered into a <meta> as well as onto
 * the unit.
 */
export const AD_NETWORK_CODE = 'S922XZBcQKUL3htm';
export const AD_NETWORK_SLOT = '0cb5f5de-ce5a-47bd-87e4-48edd0e4df15';
