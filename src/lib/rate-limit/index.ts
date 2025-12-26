/**
 * Rate Limiting Module
 * 
 * Public API for rate limiting and abuse prevention
 */

export {
  // Types
  type RateLimitAlgorithm,
  type RateLimitConfig,
  type RateLimiter,
  type RequestRecord,
  type RateLimitResult,
  
  // Constants
  DEFAULT_RATE_LIMITS,
  
  // Factory Functions
  createRateLimiter,
  createSlidingWindowLimiter,
  createTokenBucketLimiter,
  createLeakyBucketLimiter,
  
  // Rate Limit Operations
  checkRateLimit,
  recordRequest,
  isRateLimited,
  getRemainingRequests,
  getResetTime,
} from './rate-limit';
