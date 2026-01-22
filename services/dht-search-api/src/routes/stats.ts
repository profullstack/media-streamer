import { Hono } from 'hono';
import type { AppVariables, ApiResponse, DhtStats } from '../types';
import { getStats } from '../services/search';

const app = new Hono<{ Variables: AppVariables }>();

// GET /stats - Get DHT statistics
app.get('/', async (c) => {
  try {
    const stats = await getStats();

    const response: ApiResponse<DhtStats> = {
      success: true,
      data: stats,
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };

    return c.json(response);
  } catch (err) {
    console.error('Stats error:', err);

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch statistics.',
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
