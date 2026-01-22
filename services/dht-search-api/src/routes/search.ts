import { Hono } from 'hono';
import type { AppVariables, ApiResponse, SearchResults } from '../types';
import { searchTorrents } from '../services/search';
import { validateSearchParams } from '../utils/validate';

const app = new Hono<{ Variables: AppVariables }>();

// GET /search - Search torrents
app.get('/', async (c) => {
  const params = {
    q: c.req.query('q'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
    sort: c.req.query('sort'),
    order: c.req.query('order'),
    min_size: c.req.query('min_size'),
    max_size: c.req.query('max_size'),
    category: c.req.query('category'),
  };

  // Validate params
  const validation = validateSearchParams(params);

  if (!validation.valid || !validation.parsed) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: 'Invalid search parameters.',
        details: {
          errors: validation.errors,
        },
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 400);
  }

  try {
    const results = await searchTorrents(validation.parsed);

    const response: ApiResponse<SearchResults> = {
      success: true,
      data: results,
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };

    return c.json(response);
  } catch (err) {
    console.error('Search error:', err);

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Search failed. Please try again.',
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
