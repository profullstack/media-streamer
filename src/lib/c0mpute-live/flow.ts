/**
 * The two halves of the OAuth round trip, with everything they touch injected,
 * so the routes are thin and the tests run in memory.
 */

import { connectWithCredential, type LiveStreamStore } from './connect';
import {
  C0mputeError,
  beginConnect,
  decodePending,
  discoverEndpoints,
  encodePending,
  ensureClientId,
  exchangeCode,
  sameState,
  type C0mputeConfig,
  type ClientCache,
  type FetchLike,
  type Visibility,
} from './oauth';

export interface FlowDeps {
  cfg: C0mputeConfig;
  cache: ClientCache;
  store: LiveStreamStore;
  seal: (streamKey: string) => string;
  fetchImpl?: FetchLike;
}

export interface Started {
  /** c0mpute's authorize URL. */
  url: string;
  /** The sealed pending cookie to set alongside the redirect. */
  cookie: string;
}

export async function startConnect(
  deps: FlowDeps,
  input: { userId: string; visibility: Visibility; retried?: boolean }
): Promise<Started> {
  const endpoints = await discoverEndpoints(deps.cfg, deps.fetchImpl);
  const clientId = await ensureClientId(deps.cfg, deps.cache, endpoints, deps.fetchImpl);
  const { pending, url } = beginConnect(deps.cfg, endpoints, { ...input, clientId });
  return { url, cookie: encodePending(pending, deps.cfg.stateSecret) };
}

export type Outcome = 'connected' | 'failed' | 'denied';

export interface Finished {
  outcome: Outcome;
  /** Set when c0mpute forgot our client: register again and go round once more. */
  restart?: Started;
  /** A short code for the log; never a token or key. */
  reason?: string;
}

export async function finishConnect(
  deps: FlowDeps,
  input: {
    code: string | null;
    state: string | null;
    error: string | null;
    cookie: string | null | undefined;
    sessionUserId: string;
  }
): Promise<Finished> {
  const pending = decodePending(input.cookie, deps.cfg.stateSecret);
  if (!pending) return { outcome: 'failed', reason: 'no_pending' };
  if (pending.userId !== input.sessionUserId) return { outcome: 'failed', reason: 'other_user' };
  if (!sameState(pending.state, input.state)) return { outcome: 'failed', reason: 'bad_state' };
  if (input.error) return { outcome: input.error === 'access_denied' ? 'denied' : 'failed', reason: 'provider_error' };
  if (!input.code) return { outcome: 'failed', reason: 'no_code' };

  try {
    const endpoints = await discoverEndpoints(deps.cfg, deps.fetchImpl);
    const token = await exchangeCode(
      deps.cfg,
      endpoints,
      { code: input.code, verifier: pending.verifier, clientId: pending.clientId },
      deps.fetchImpl
    );
    await connectWithCredential(
      deps.cfg,
      token,
      { userId: pending.userId, visibility: pending.visibility },
      deps.store,
      deps.seal,
      deps.fetchImpl
    );
    return { outcome: 'connected' };
  } catch (err) {
    if (err instanceof C0mputeError && err.code === 'invalid_client' && !pending.retried) {
      await deps.cache.clearClient();
      const restart = await startConnect(deps, {
        userId: pending.userId,
        visibility: pending.visibility,
        retried: true,
      });
      return { outcome: 'failed', restart, reason: 'invalid_client' };
    }
    return { outcome: 'failed', reason: err instanceof C0mputeError ? err.code : 'error' };
  }
}
