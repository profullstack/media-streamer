/**
 * Rate Limiting Module Tests
 * 
 * TDD tests for rate limiting and abuse prevention
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRateLimiter,
  checkRateLimit,
  recordRequest,
  isRateLimited,
  getRemainingRequests,
  getResetTime,
  createSlidingWindowLimiter,
  createTokenBucketLimiter,
  createLeakyBucketLimiter,
  RateLimiter,
  RateLimitConfig,
  RateLimitResult,
  RateLimitAlgorithm,
  DEFAULT_RATE_LIMITS,
} from './rate-limit';

describe('Rate Limiting Module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rate Limiter Creation', () => {
    it('should create a rate limiter with default config', () => {
      const limiter = createRateLimiter({
        key: 'test-limiter',
        maxRequests: 100,
        windowMs: 60000, // 1 minute
      });

      expect(limiter.key).toBe('test-limiter');
      expect(limiter.maxRequests).toBe(100);
      expect(limiter.windowMs).toBe(60000);
      expect(limiter.algorithm).toBe('sliding-window');
    });

    it('should create a rate limiter with custom algorithm', () => {
      const limiter = createRateLimiter({
        key: 'token-limiter',
        maxRequests: 50,
        windowMs: 30000,
        algorithm: 'token-bucket',
      });

      expect(limiter.algorithm).toBe('token-bucket');
    });
  });

  describe('Rate Limit Checking', () => {
    it('should allow requests within limit', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 5,
        windowMs: 60000,
      });

      const result = checkRateLimit(limiter, 'user-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should block requests exceeding limit', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 3,
        windowMs: 60000,
      });

      // Make 3 requests
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      const result = checkRateLimit(limiter, 'user-123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different users separately', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 2,
        windowMs: 60000,
      });

      recordRequest(limiter, 'user-1');
      recordRequest(limiter, 'user-1');

      const result1 = checkRateLimit(limiter, 'user-1');
      const result2 = checkRateLimit(limiter, 'user-2');

      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Request Recording', () => {
    it('should record requests', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 10,
        windowMs: 60000,
      });

      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      const result = checkRateLimit(limiter, 'user-123');

      expect(result.remaining).toBe(7); // 10 - 2 - 1 (check also counts)
    });

    it('should expire old requests', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 3,
        windowMs: 60000,
      });

      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      // Advance time past window
      vi.advanceTimersByTime(61000);

      const result = checkRateLimit(limiter, 'user-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });
  });

  describe('Rate Limited Status', () => {
    it('should check if user is rate limited', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 2,
        windowMs: 60000,
      });

      expect(isRateLimited(limiter, 'user-123')).toBe(false);

      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      expect(isRateLimited(limiter, 'user-123')).toBe(true);
    });
  });

  describe('Remaining Requests', () => {
    it('should get remaining requests', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 5,
        windowMs: 60000,
      });

      expect(getRemainingRequests(limiter, 'user-123')).toBe(5);

      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      expect(getRemainingRequests(limiter, 'user-123')).toBe(3);
    });

    it('should not go below zero', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 2,
        windowMs: 60000,
      });

      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      expect(getRemainingRequests(limiter, 'user-123')).toBe(0);
    });
  });

  describe('Reset Time', () => {
    it('should get reset time', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 5,
        windowMs: 60000,
      });

      recordRequest(limiter, 'user-123');

      const resetTime = getResetTime(limiter, 'user-123');

      expect(resetTime).toBeGreaterThan(Date.now());
      expect(resetTime).toBeLessThanOrEqual(Date.now() + 60000);
    });

    it('should return current time for new users', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 5,
        windowMs: 60000,
      });

      const resetTime = getResetTime(limiter, 'new-user');

      expect(resetTime).toBeLessThanOrEqual(Date.now() + 60000);
    });
  });

  describe('Sliding Window Limiter', () => {
    it('should create sliding window limiter', () => {
      const limiter = createSlidingWindowLimiter({
        key: 'sliding',
        maxRequests: 100,
        windowMs: 60000,
      });

      expect(limiter.algorithm).toBe('sliding-window');
    });

    it('should handle sliding window correctly', () => {
      const limiter = createSlidingWindowLimiter({
        key: 'sliding',
        maxRequests: 4,
        windowMs: 60000,
      });

      // Make 2 requests at t=0
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      // Advance 30 seconds
      vi.advanceTimersByTime(30000);

      // Make 2 more requests at t=30s
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      // Should be rate limited
      expect(isRateLimited(limiter, 'user-123')).toBe(true);

      // Advance 31 more seconds (t=61s)
      vi.advanceTimersByTime(31000);

      // First 2 requests should have expired
      expect(isRateLimited(limiter, 'user-123')).toBe(false);
    });
  });

  describe('Token Bucket Limiter', () => {
    it('should create token bucket limiter', () => {
      const limiter = createTokenBucketLimiter({
        key: 'token',
        maxRequests: 10,
        windowMs: 60000,
        refillRate: 1, // 1 token per second
      });

      expect(limiter.algorithm).toBe('token-bucket');
    });

    it('should refill tokens over time', () => {
      const limiter = createTokenBucketLimiter({
        key: 'token',
        maxRequests: 5,
        windowMs: 60000,
        refillRate: 1,
      });

      // Use all tokens
      for (let i = 0; i < 5; i++) {
        recordRequest(limiter, 'user-123');
      }

      expect(isRateLimited(limiter, 'user-123')).toBe(true);

      // Advance 2 seconds (should refill 2 tokens)
      vi.advanceTimersByTime(2000);

      expect(isRateLimited(limiter, 'user-123')).toBe(false);
      expect(getRemainingRequests(limiter, 'user-123')).toBe(2);
    });
  });

  describe('Leaky Bucket Limiter', () => {
    it('should create leaky bucket limiter', () => {
      const limiter = createLeakyBucketLimiter({
        key: 'leaky',
        maxRequests: 10,
        windowMs: 60000,
        leakRate: 1, // 1 request per second
      });

      expect(limiter.algorithm).toBe('leaky-bucket');
    });

    it('should leak requests over time', () => {
      const limiter = createLeakyBucketLimiter({
        key: 'leaky',
        maxRequests: 3,
        windowMs: 60000,
        leakRate: 1,
      });

      // Fill bucket
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');
      recordRequest(limiter, 'user-123');

      expect(isRateLimited(limiter, 'user-123')).toBe(true);

      // Advance 2 seconds (should leak 2 requests)
      vi.advanceTimersByTime(2000);

      expect(isRateLimited(limiter, 'user-123')).toBe(false);
    });
  });

  describe('Default Rate Limits', () => {
    it('should have default rate limits for different actions', () => {
      expect(DEFAULT_RATE_LIMITS.api).toBeDefined();
      expect(DEFAULT_RATE_LIMITS.api.maxRequests).toBeGreaterThan(0);

      expect(DEFAULT_RATE_LIMITS.stream).toBeDefined();
      expect(DEFAULT_RATE_LIMITS.magnet).toBeDefined();
      expect(DEFAULT_RATE_LIMITS.search).toBeDefined();
      expect(DEFAULT_RATE_LIMITS.auth).toBeDefined();
    });

    it('should have stricter limits for auth', () => {
      expect(DEFAULT_RATE_LIMITS.auth.maxRequests).toBeLessThan(
        DEFAULT_RATE_LIMITS.api.maxRequests
      );
    });
  });

  describe('Rate Limit Result', () => {
    it('should include all required fields', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 10,
        windowMs: 60000,
      });

      const result = checkRateLimit(limiter, 'user-123');

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAt');
      expect(result).toHaveProperty('retryAfter');
    });

    it('should have retryAfter when rate limited', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 1,
        windowMs: 60000,
      });

      recordRequest(limiter, 'user-123');

      const result = checkRateLimit(limiter, 'user-123');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('IP-based Rate Limiting', () => {
    it('should support IP-based keys', () => {
      const limiter = createRateLimiter({
        key: 'ip-limit',
        maxRequests: 5,
        windowMs: 60000,
      });

      recordRequest(limiter, '192.168.1.1');
      recordRequest(limiter, '192.168.1.1');

      const result1 = checkRateLimit(limiter, '192.168.1.1');
      const result2 = checkRateLimit(limiter, '192.168.1.2');

      expect(result1.remaining).toBe(2);
      expect(result2.remaining).toBe(4);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent requests correctly', () => {
      const limiter = createRateLimiter({
        key: 'concurrent',
        maxRequests: 10,
        windowMs: 60000,
      });

      // Simulate concurrent requests
      const results = [];
      for (let i = 0; i < 15; i++) {
        results.push(checkRateLimit(limiter, 'user-123'));
        if (results[results.length - 1].allowed) {
          recordRequest(limiter, 'user-123');
        }
      }

      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;

      expect(allowed).toBe(10);
      expect(blocked).toBe(5);
    });
  });

  describe('Rate Limit Algorithms', () => {
    it('should support all algorithm types', () => {
      const algorithms: RateLimitAlgorithm[] = [
        'sliding-window',
        'token-bucket',
        'leaky-bucket',
      ];

      algorithms.forEach(algorithm => {
        const limiter = createRateLimiter({
          key: `test-${algorithm}`,
          maxRequests: 10,
          windowMs: 60000,
          algorithm,
        });

        expect(limiter.algorithm).toBe(algorithm);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero max requests', () => {
      const limiter = createRateLimiter({
        key: 'zero',
        maxRequests: 0,
        windowMs: 60000,
      });

      const result = checkRateLimit(limiter, 'user-123');

      expect(result.allowed).toBe(false);
    });

    it('should handle very short windows', () => {
      const limiter = createRateLimiter({
        key: 'short',
        maxRequests: 1,
        windowMs: 100, // 100ms
      });

      recordRequest(limiter, 'user-123');
      expect(isRateLimited(limiter, 'user-123')).toBe(true);

      vi.advanceTimersByTime(101);
      expect(isRateLimited(limiter, 'user-123')).toBe(false);
    });

    it('should handle empty identifier', () => {
      const limiter = createRateLimiter({
        key: 'test',
        maxRequests: 5,
        windowMs: 60000,
      });

      const result = checkRateLimit(limiter, '');

      expect(result.allowed).toBe(true);
    });
  });
});
