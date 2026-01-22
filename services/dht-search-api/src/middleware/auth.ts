import type { MiddlewareHandler } from 'hono';
import type { AppVariables, ApiResponse } from '../types';
import { validateApiKey } from '../services/usage';

// API key authentication middleware
export const authMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  // Get API key from Authorization header or query param
  let apiKey: string | undefined;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  } else {
    apiKey = c.req.query('api_key');
  }

  if (!apiKey) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API key is required. Provide via Authorization header (Bearer <key>) or api_key query parameter.',
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 401);
  }

  // Validate API key
  const key = await validateApiKey(apiKey);

  if (!key) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid or expired API key.',
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 401);
  }

  // Check if key is active
  if (!key.is_active) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API key has been deactivated.',
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 401);
  }

  // Check expiration
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'EXPIRED_API_KEY',
        message: 'API key has expired.',
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 401);
  }

  // Store API key in context
  c.set('apiKey', key);

  await next();
};

// Optional auth - doesn't require API key but stores it if provided
export const optionalAuthMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (
  c,
  next
) => {
  let apiKey: string | undefined;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  } else {
    apiKey = c.req.query('api_key');
  }

  if (apiKey) {
    const key = await validateApiKey(apiKey);
    if (key && key.is_active) {
      c.set('apiKey', key);
    }
  }

  await next();
};
