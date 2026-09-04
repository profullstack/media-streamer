/**
 * Budget for the residential proxy.
 *
 * Every byte that leaves through the proxy is paid for per gigabyte, and the same
 * credential is shared by everything that uses it. So nothing may use the proxy
 * anonymously, and nothing may use it without bound:
 *
 *   - Gate: a proxied fetch must run inside a scope (`withProxyScope`), which
 *     `withSiriusXmUser` establishes for the user whose account is doing the
 *     fetching. A proxied call with no scope is refused outright.
 *   - Requests: a per-scope cap per minute. HLS asks for a manifest and a segment
 *     every few seconds; anything far above that is a scraper or a bug.
 *   - Concurrency: a per-scope and a global cap on in-flight proxied responses,
 *     so one account cannot open a dozen streams at once.
 *   - Bytes: a per-scope and a global cap over a rolling 24 hours, metered as the
 *     response body streams through, so a long-running stream is cut off when the
 *     budget runs out rather than counted after the fact.
 *
 * State is in-process. The app runs as one Node process on one box, which is the
 * only place the proxy credential lives, so that is also the only place the count
 * needs to be. A restart resets the day; the dashboard's own accounting is the
 * source of truth for the bill.
 *
 * Sizing (env, all optional):
 *   PROXY_BYTES_PER_USER_PER_DAY    default 3 GiB  (~27 h of 256 kbps audio)
 *   PROXY_BYTES_GLOBAL_PER_DAY      default 8 GiB  (~$30/day at the worst per-GB tier)
 *   PROXY_REQUESTS_PER_USER_PER_MIN default 120
 *   PROXY_MAX_CONCURRENT_PER_USER   default 4
 *   PROXY_MAX_CONCURRENT_GLOBAL     default 24
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const GIB = 1024 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type ProxyBudgetKind = 'ungated' | 'requests' | 'concurrency' | 'bytes';

export class ProxyBudgetError extends Error {
  readonly kind: ProxyBudgetKind;
  readonly scope: string | null;
  /** 'scope' when the caller's own cap was hit, 'global' when everyone's was. */
  readonly level: 'scope' | 'global';
  readonly retryAfterSeconds: number;

  constructor(
    kind: ProxyBudgetKind,
    scope: string | null,
    level: 'scope' | 'global',
    retryAfterSeconds: number,
  ) {
    super(describe(kind, level));
    this.name = 'ProxyBudgetError';
    this.kind = kind;
    this.scope = scope;
    this.level = level;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function describe(kind: ProxyBudgetKind, level: 'scope' | 'global'): string {
  switch (kind) {
    case 'ungated':
      return 'Proxied request outside a proxy scope; wrap the caller with withProxyScope().';
    case 'requests':
      return 'Too many proxied requests this minute.';
    case 'concurrency':
      return level === 'global'
        ? 'Too many proxied streams open right now.'
        : 'Too many proxied streams open for this account.';
    case 'bytes':
      return level === 'global'
        ? 'Daily proxy bandwidth budget exhausted.'
        : 'Daily proxy bandwidth budget exhausted for this account.';
  }
}

export interface ProxyBudgetConfig {
  bytesPerScopePerDay: number;
  bytesGlobalPerDay: number;
  requestsPerScopePerMinute: number;
  maxConcurrentPerScope: number;
  maxConcurrentGlobal: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getProxyBudgetConfig(): ProxyBudgetConfig {
  return {
    bytesPerScopePerDay: envInt('PROXY_BYTES_PER_USER_PER_DAY', 3 * GIB),
    bytesGlobalPerDay: envInt('PROXY_BYTES_GLOBAL_PER_DAY', 8 * GIB),
    requestsPerScopePerMinute: envInt('PROXY_REQUESTS_PER_USER_PER_MIN', 120),
    maxConcurrentPerScope: envInt('PROXY_MAX_CONCURRENT_PER_USER', 4),
    maxConcurrentGlobal: envInt('PROXY_MAX_CONCURRENT_GLOBAL', 24),
  };
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

const scopeStorage = new AsyncLocalStorage<{ scope: string }>();

/** Run `fn` with every proxied fetch inside it charged to `scope`. */
export function withProxyScope<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  return scopeStorage.run({ scope }, fn);
}

export function currentProxyScope(): string | null {
  return scopeStorage.getStore()?.scope ?? null;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

interface ScopeState {
  /** minute-bucket start (ms) -> bytes charged in that minute */
  byteBuckets: Map<number, number>;
  /** timestamps of recent request starts, oldest first */
  requestTimes: number[];
  inFlight: number;
}

const GLOBAL = '*';
const scopes = new Map<string, ScopeState>();

function state(scope: string): ScopeState {
  let s = scopes.get(scope);
  if (!s) {
    s = { byteBuckets: new Map(), requestTimes: [], inFlight: 0 };
    scopes.set(scope, s);
  }
  return s;
}

function bytesInWindow(s: ScopeState, now: number): number {
  const cutoff = now - DAY_MS;
  let total = 0;
  for (const [minute, bytes] of s.byteBuckets) {
    if (minute < cutoff) s.byteBuckets.delete(minute);
    else total += bytes;
  }
  return total;
}

function requestsInWindow(s: ScopeState, now: number): number {
  const cutoff = now - MINUTE_MS;
  while (s.requestTimes.length && s.requestTimes[0] < cutoff) s.requestTimes.shift();
  return s.requestTimes.length;
}

function charge(scope: string, bytes: number, now: number): void {
  const minute = now - (now % MINUTE_MS);
  for (const key of [scope, GLOBAL]) {
    const s = state(key);
    s.byteBuckets.set(minute, (s.byteBuckets.get(minute) ?? 0) + bytes);
  }
}

/** Seconds until the oldest byte bucket in the window ages out. */
function secondsUntilBytesFree(s: ScopeState, now: number): number {
  let oldest = Infinity;
  for (const minute of s.byteBuckets.keys()) if (minute < oldest) oldest = minute;
  if (oldest === Infinity) return 60;
  return Math.max(60, Math.ceil((oldest + DAY_MS - now) / 1000));
}

export interface ProxyBudgetCounts {
  scopeBytes: number;
  globalBytes: number;
  scopeRequests: number;
  scopeInFlight: number;
  globalInFlight: number;
}

/** Pure policy: may one more proxied request start, given these counts? */
export function evaluateProxyBudget(
  counts: ProxyBudgetCounts,
  config: ProxyBudgetConfig,
): { allowed: true } | { allowed: false; kind: ProxyBudgetKind; level: 'scope' | 'global' } {
  if (counts.globalBytes >= config.bytesGlobalPerDay) {
    return { allowed: false, kind: 'bytes', level: 'global' };
  }
  if (counts.scopeBytes >= config.bytesPerScopePerDay) {
    return { allowed: false, kind: 'bytes', level: 'scope' };
  }
  if (counts.globalInFlight >= config.maxConcurrentGlobal) {
    return { allowed: false, kind: 'concurrency', level: 'global' };
  }
  if (counts.scopeInFlight >= config.maxConcurrentPerScope) {
    return { allowed: false, kind: 'concurrency', level: 'scope' };
  }
  if (counts.scopeRequests >= config.requestsPerScopePerMinute) {
    return { allowed: false, kind: 'requests', level: 'scope' };
  }
  return { allowed: true };
}

export function proxyBudgetCounts(scope: string, now = Date.now()): ProxyBudgetCounts {
  const s = state(scope);
  const g = state(GLOBAL);
  return {
    scopeBytes: bytesInWindow(s, now),
    globalBytes: bytesInWindow(g, now),
    scopeRequests: requestsInWindow(s, now),
    scopeInFlight: s.inFlight,
    globalInFlight: g.inFlight,
  };
}

// ---------------------------------------------------------------------------
// Admission and metering
// ---------------------------------------------------------------------------

export interface ProxyLease {
  scope: string;
  /** Charge bytes to the lease's scope; throws once the budget is gone. */
  charge(bytes: number): void;
  /** Release the concurrency slot. Idempotent. */
  release(): void;
}

/**
 * Admit one proxied request for the current scope, or throw.
 *
 * The caller must `release()` the lease when the response body is finished with,
 * and should `charge()` every body chunk as it arrives.
 */
export function admitProxiedRequest(
  scope: string | null = currentProxyScope(),
  config: ProxyBudgetConfig = getProxyBudgetConfig(),
  now = Date.now(),
): ProxyLease {
  if (!scope) throw new ProxyBudgetError('ungated', null, 'scope', 0);

  const counts = proxyBudgetCounts(scope, now);
  const verdict = evaluateProxyBudget(counts, config);
  if (!verdict.allowed) {
    const retry =
      verdict.kind === 'bytes'
        ? secondsUntilBytesFree(state(verdict.level === 'global' ? GLOBAL : scope), now)
        : verdict.kind === 'requests'
          ? 60
          : 5;
    throw new ProxyBudgetError(verdict.kind, scope, verdict.level, retry);
  }

  const s = state(scope);
  const g = state(GLOBAL);
  s.requestTimes.push(now);
  s.inFlight += 1;
  g.inFlight += 1;

  let released = false;
  return {
    scope,
    charge(bytes: number) {
      const at = Date.now();
      charge(scope, bytes, at);
      const after = proxyBudgetCounts(scope, at);
      if (after.globalBytes >= config.bytesGlobalPerDay) {
        throw new ProxyBudgetError('bytes', scope, 'global', secondsUntilBytesFree(g, at));
      }
      if (after.scopeBytes >= config.bytesPerScopePerDay) {
        throw new ProxyBudgetError('bytes', scope, 'scope', secondsUntilBytesFree(s, at));
      }
    },
    release() {
      if (released) return;
      released = true;
      s.inFlight = Math.max(0, s.inFlight - 1);
      g.inFlight = Math.max(0, g.inFlight - 1);
    },
  };
}

/**
 * Wrap a response so its body is charged to the lease as it is read, and the
 * lease is released when the body ends, errors, or is cancelled.
 *
 * Bodies are read through a hand-rolled ReadableStream rather than a
 * TransformStream because a transformer's `cancel` hook is newer than the Node we
 * deploy on, and a listener closing the tab is exactly the case that must release
 * the slot.
 */
export function meterResponse(response: Response, lease: ProxyLease): Response {
  const body = response.body;
  if (!body) {
    lease.release();
    return response;
  }

  const reader = body.getReader();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    lease.release();
  };

  const metered = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err) {
        finish();
        controller.error(err);
        return;
      }
      if (result.done) {
        finish();
        controller.close();
        return;
      }
      try {
        lease.charge(result.value.byteLength);
      } catch (err) {
        finish();
        reader.cancel().catch(() => undefined);
        controller.error(err);
        return;
      }
      controller.enqueue(result.value);
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason).catch(() => undefined);
    },
  });

  return new Response(metered, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// ---------------------------------------------------------------------------
// Diagnostics / tests
// ---------------------------------------------------------------------------

export function proxyBudgetSnapshot(now = Date.now()): Record<string, ProxyBudgetCounts> {
  const out: Record<string, ProxyBudgetCounts> = {};
  for (const scope of scopes.keys()) {
    if (scope === GLOBAL) continue;
    out[scope] = proxyBudgetCounts(scope, now);
  }
  return out;
}

export function resetProxyBudget(): void {
  scopes.clear();
}

/** HTTP 429 for a budget refusal, with Retry-After. */
export function proxyBudgetResponse(error: ProxyBudgetError): Response {
  return new Response(error.message, {
    status: 429,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': String(error.retryAfterSeconds),
      'Cache-Control': 'no-store',
    },
  });
}
