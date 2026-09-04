/**
 * fetch that accepts an undici dispatcher, and the one gate onto the paid proxy.
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
 *
 * Because every proxied call already has to come through here, this is also where
 * the proxy budget is enforced: a call that carries a dispatcher is admitted against
 * the current scope's budget (see proxy-budget.ts) and its body is metered. A call
 * without a dispatcher goes straight out and costs nothing, so it is not counted.
 */

import { fetch as undiciFetch, type Dispatcher } from 'undici';
import { admitProxiedRequest, meterResponse } from './proxy-budget';

export type ProxyFetchInit = RequestInit & { dispatcher?: Dispatcher };

export async function proxyFetch(
  input: string | URL,
  init: ProxyFetchInit = {},
): Promise<Response> {
  const send = () =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      init as Parameters<typeof undiciFetch>[1],
    ) as unknown as Promise<Response>;

  if (!init.dispatcher) return send();

  const lease = admitProxiedRequest();
  let response: Response;
  try {
    response = await send();
  } catch (err) {
    lease.release();
    throw err;
  }
  return meterResponse(response, lease);
}
