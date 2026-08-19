/**
 * fetch that accepts an undici dispatcher.
 *
 * A dispatcher only works with the fetch from the SAME undici instance. Node backs
 * global fetch with its own bundled copy, so handing it a ProxyAgent built from the
 * `undici` package fails at runtime with:
 *
 *   UND_ERR_INVALID_ARG: invalid onRequestStart method
 *
 * because the two versions disagree on the handler interface. It worked while the
 * package tracked undici 7, close to what Node bundles, and broke on the bump to 8.
 *
 * So proxied calls must go through undici's own fetch. Its Response and RequestInit
 * are the same WHATWG shapes as the globals but a structurally distinct type, since
 * they come from a second copy of the declarations — hence the casts here. They are
 * contained in this one file rather than repeated at every call site, which is also
 * the only honest place to explain why they are safe.
 */

import { fetch as undiciFetch, type Dispatcher } from 'undici';

export type ProxyFetchInit = RequestInit & { dispatcher?: Dispatcher };

export function proxyFetch(input: string | URL, init: ProxyFetchInit = {}): Promise<Response> {
  return undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    init as Parameters<typeof undiciFetch>[1],
  ) as unknown as Promise<Response>;
}
