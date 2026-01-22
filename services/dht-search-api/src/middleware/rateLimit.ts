import type { MiddlewareHandler } from 'hono';
import type { AppVariables, ApiResponse } from '../types';
import { checkRateLimit, checkDailyQuota } from '../services/usage';

// Rate limiting middleware
export const rateLimitMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (
  c,
  next
) => {
  const apiKey = c.get('apiKey');

  if (!apiKey) {
    // No API key - skip rate limiting (auth middleware should have rejected)
    await next();
    return;
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(apiKey);

  // Set rate limit headers
  c.header('X-RateLimit-Limit', String(apiKey.rate_limit_per_min));
  c.header('X-RateLimit-Remaining', String(rateLimit.remaining));
  c.header('X-RateLimit-Reset', String(Math.floor(rateLimit.resetAt.getTime() / 1000)));

  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000);
    c.header('Retry-After', String(retryAfter));

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        details: {
          limit: apiKey.rate_limit_per_min,
          window: '1m',
          retry_after: retryAfter,
        },
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 429);
  }

  // Check daily quota
  const dailyQuota = await checkDailyQuota(apiKey);

  c.header('X-DailyLimit-Limit', String(dailyQuota.limit));
  c.header('X-DailyLimit-Used', String(dailyQuota.used));
  c.header('X-DailyLimit-Remaining', String(dailyQuota.limit - dailyQuota.used));

  if (!dailyQuota.allowed) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'Daily request quota exceeded. Quota resets at midnight UTC.',
        details: {
          used: dailyQuota.used,
          limit: dailyQuota.limit,
        },
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 429);
  }

  await next();
};
