/**
 * Rate Limiting Module
 * 
 * Implements rate limiting and abuse prevention with multiple algorithms
 */

// Types
export type RateLimitAlgorithm = 'sliding-window' | 'token-bucket' | 'leaky-bucket';

export interface RateLimitConfig {
  key: string;
  maxRequests: number;
  windowMs: number;
  algorithm?: RateLimitAlgorithm;
  refillRate?: number; // For token bucket
  leakRate?: number; // For leaky bucket
}

export interface RateLimiter {
  key: string;
  maxRequests: number;
  windowMs: number;
  algorithm: RateLimitAlgorithm;
  refillRate?: number;
  leakRate?: number;
  requests: Map<string, RequestRecord>;
}

export interface RequestRecord {
  timestamps: number[];
  tokens?: number;
  lastRefill?: number;
  bucketLevel?: number;
  lastLeak?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

// Default rate limits for different actions
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  api: {
    key: 'api',
    maxRequests: 1000,
    windowMs: 60000, // 1 minute
    algorithm: 'sliding-window',
  },
  stream: {
    key: 'stream',
    maxRequests: 50,
    windowMs: 60000,
    algorithm: 'sliding-window',
  },
  magnet: {
    key: 'magnet',
    maxRequests: 30,
    windowMs: 60000,
    algorithm: 'sliding-window',
  },
  search: {
    key: 'search',
    maxRequests: 100,
    windowMs: 60000,
    algorithm: 'sliding-window',
  },
  auth: {
    key: 'auth',
    maxRequests: 10,
    windowMs: 60000,
    algorithm: 'sliding-window',
  },
};

/**
 * Create a rate limiter with the given configuration
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return {
    key: config.key,
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    algorithm: config.algorithm ?? 'sliding-window',
    refillRate: config.refillRate,
    leakRate: config.leakRate,
    requests: new Map(),
  };
}

/**
 * Create a sliding window rate limiter
 */
export function createSlidingWindowLimiter(config: Omit<RateLimitConfig, 'algorithm'>): RateLimiter {
  return createRateLimiter({
    ...config,
    algorithm: 'sliding-window',
  });
}

/**
 * Create a token bucket rate limiter
 */
export function createTokenBucketLimiter(config: Omit<RateLimitConfig, 'algorithm'> & { refillRate: number }): RateLimiter {
  return createRateLimiter({
    ...config,
    algorithm: 'token-bucket',
  });
}

/**
 * Create a leaky bucket rate limiter
 */
export function createLeakyBucketLimiter(config: Omit<RateLimitConfig, 'algorithm'> & { leakRate: number }): RateLimiter {
  return createRateLimiter({
    ...config,
    algorithm: 'leaky-bucket',
  });
}

/**
 * Get or create request record for an identifier
 */
function getRequestRecord(limiter: RateLimiter, identifier: string): RequestRecord {
  let record = limiter.requests.get(identifier);
  
  if (!record) {
    record = {
      timestamps: [],
      tokens: limiter.maxRequests,
      lastRefill: Date.now(),
      bucketLevel: 0,
      lastLeak: Date.now(),
    };
    limiter.requests.set(identifier, record);
  }
  
  return record;
}

/**
 * Clean up expired timestamps from sliding window
 */
function cleanupExpiredTimestamps(record: RequestRecord, windowMs: number): void {
  const now = Date.now();
  const cutoff = now - windowMs;
  record.timestamps = record.timestamps.filter(ts => ts > cutoff);
}

/**
 * Refill tokens for token bucket algorithm
 */
function refillTokens(record: RequestRecord, limiter: RateLimiter): void {
  if (limiter.algorithm !== 'token-bucket' || !limiter.refillRate) {
    return;
  }
  
  const now = Date.now();
  const elapsed = (now - (record.lastRefill ?? now)) / 1000; // seconds
  const tokensToAdd = Math.floor(elapsed * limiter.refillRate);
  
  if (tokensToAdd > 0) {
    record.tokens = Math.min(
      limiter.maxRequests,
      (record.tokens ?? 0) + tokensToAdd
    );
    record.lastRefill = now;
  }
}

/**
 * Leak requests for leaky bucket algorithm
 */
function leakRequests(record: RequestRecord, limiter: RateLimiter): void {
  if (limiter.algorithm !== 'leaky-bucket' || !limiter.leakRate) {
    return;
  }
  
  const now = Date.now();
  const elapsed = (now - (record.lastLeak ?? now)) / 1000; // seconds
  const requestsToLeak = Math.floor(elapsed * limiter.leakRate);
  
  if (requestsToLeak > 0) {
    record.bucketLevel = Math.max(0, (record.bucketLevel ?? 0) - requestsToLeak);
    record.lastLeak = now;
  }
}

/**
 * Check if a request is allowed under the rate limit
 */
export function checkRateLimit(limiter: RateLimiter, identifier: string): RateLimitResult {
  const record = getRequestRecord(limiter, identifier);
  const now = Date.now();
  
  switch (limiter.algorithm) {
    case 'token-bucket':
      refillTokens(record, limiter);
      return checkTokenBucket(limiter, record, now);
    
    case 'leaky-bucket':
      leakRequests(record, limiter);
      return checkLeakyBucket(limiter, record, now);
    
    case 'sliding-window':
    default:
      cleanupExpiredTimestamps(record, limiter.windowMs);
      return checkSlidingWindow(limiter, record, now);
  }
}

/**
 * Check sliding window rate limit
 */
function checkSlidingWindow(limiter: RateLimiter, record: RequestRecord, now: number): RateLimitResult {
  const requestCount = record.timestamps.length;
  const allowed = requestCount < limiter.maxRequests;
  const remaining = Math.max(0, limiter.maxRequests - requestCount - (allowed ? 1 : 0));
  
  const oldestTimestamp = record.timestamps[0] ?? now;
  const resetAt = oldestTimestamp + limiter.windowMs;
  const retryAfter = allowed ? 0 : Math.max(0, Math.ceil((resetAt - now) / 1000));
  
  return {
    allowed,
    remaining,
    resetAt,
    retryAfter,
  };
}

/**
 * Check token bucket rate limit
 */
function checkTokenBucket(limiter: RateLimiter, record: RequestRecord, now: number): RateLimitResult {
  const tokens = record.tokens ?? 0;
  const allowed = tokens > 0;
  const remaining = Math.max(0, tokens - (allowed ? 1 : 0));
  
  const resetAt = now + limiter.windowMs;
  const retryAfter = allowed ? 0 : Math.ceil(1 / (limiter.refillRate ?? 1));
  
  return {
    allowed,
    remaining,
    resetAt,
    retryAfter,
  };
}

/**
 * Check leaky bucket rate limit
 */
function checkLeakyBucket(limiter: RateLimiter, record: RequestRecord, now: number): RateLimitResult {
  const bucketLevel = record.bucketLevel ?? 0;
  const allowed = bucketLevel < limiter.maxRequests;
  const remaining = Math.max(0, limiter.maxRequests - bucketLevel - (allowed ? 1 : 0));
  
  const resetAt = now + limiter.windowMs;
  const retryAfter = allowed ? 0 : Math.ceil(1 / (limiter.leakRate ?? 1));
  
  return {
    allowed,
    remaining,
    resetAt,
    retryAfter,
  };
}

/**
 * Record a request for rate limiting
 */
export function recordRequest(limiter: RateLimiter, identifier: string): void {
  const record = getRequestRecord(limiter, identifier);
  const now = Date.now();
  
  switch (limiter.algorithm) {
    case 'token-bucket':
      refillTokens(record, limiter);
      if ((record.tokens ?? 0) > 0) {
        record.tokens = (record.tokens ?? 0) - 1;
      }
      break;
    
    case 'leaky-bucket':
      leakRequests(record, limiter);
      record.bucketLevel = (record.bucketLevel ?? 0) + 1;
      break;
    
    case 'sliding-window':
    default:
      cleanupExpiredTimestamps(record, limiter.windowMs);
      record.timestamps.push(now);
      break;
  }
}

/**
 * Check if an identifier is currently rate limited
 */
export function isRateLimited(limiter: RateLimiter, identifier: string): boolean {
  const result = checkRateLimit(limiter, identifier);
  return !result.allowed;
}

/**
 * Get remaining requests for an identifier
 */
export function getRemainingRequests(limiter: RateLimiter, identifier: string): number {
  const record = getRequestRecord(limiter, identifier);
  
  switch (limiter.algorithm) {
    case 'token-bucket':
      refillTokens(record, limiter);
      return Math.max(0, record.tokens ?? 0);
    
    case 'leaky-bucket':
      leakRequests(record, limiter);
      return Math.max(0, limiter.maxRequests - (record.bucketLevel ?? 0));
    
    case 'sliding-window':
    default:
      cleanupExpiredTimestamps(record, limiter.windowMs);
      return Math.max(0, limiter.maxRequests - record.timestamps.length);
  }
}

/**
 * Get the reset time for an identifier
 */
export function getResetTime(limiter: RateLimiter, identifier: string): number {
  const record = getRequestRecord(limiter, identifier);
  const now = Date.now();
  
  switch (limiter.algorithm) {
    case 'token-bucket':
    case 'leaky-bucket':
      return now + limiter.windowMs;
    
    case 'sliding-window':
    default:
      cleanupExpiredTimestamps(record, limiter.windowMs);
      const oldestTimestamp = record.timestamps[0] ?? now;
      return oldestTimestamp + limiter.windowMs;
  }
}
