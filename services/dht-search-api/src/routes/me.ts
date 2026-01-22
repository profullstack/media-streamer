import { Hono } from 'hono';
import type { AppVariables, ApiResponse, ApiKeyInfo } from '../types';
import { getApiKeyInfo } from '../services/usage';

const app = new Hono<{ Variables: AppVariables }>();

// GET /me - Get API key info
app.get('/', async (c) => {
  const apiKey = c.get('apiKey');

  if (!apiKey) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API key required.',
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 401);
  }

  try {
    const info = await getApiKeyInfo(apiKey);

    const response: ApiResponse<ApiKeyInfo> = {
      success: true,
      data: info,
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };

    return c.json(response);
  } catch (err) {
    console.error('API key info error:', err);

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch API key info.',
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 500);
  }
});

export default app;
