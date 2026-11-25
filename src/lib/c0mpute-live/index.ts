/**
 * c0mpute Live: a member broadcasts their own camera or screen through the
 * c0mpute network. See oauth.ts (connect), connect.ts (the member's stream),
 * sessions.ts (the encoder) and the routes under /api/live.
 */

import { openStreamKey, sealStreamKey, streamKeySecret } from './crypto';
import type { FlowDeps } from './flow';
import { c0mputeConfig } from './oauth';
import { supabaseClientCache, supabaseLiveStreamStore } from './store';

export * from './api';
export * from './connect';
export * from './crypto';
export * from './flow';
export * from './oauth';
export * from './sessions';
export { supabaseClientCache, supabaseLiveStreamStore } from './store';

/** Everything the routes need, or null when the server has no secret to work with. */
export function liveDeps(): (FlowDeps & { open: (sealed: string) => string }) | null {
  const cfg = c0mputeConfig();
  const secret = streamKeySecret();
  if (!cfg || !secret) return null;
  return {
    cfg,
    cache: supabaseClientCache(),
    store: supabaseLiveStreamStore(),
    seal: (streamKey) => sealStreamKey(streamKey, secret),
    open: (sealed) => openStreamKey(sealed, secret),
  };
}
