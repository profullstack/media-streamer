import { Hono } from 'hono';
import type { AppVariables, ApiResponse, Torrent, TorrentCategory } from '../types';
import { getRecentTorrents } from '../services/search';
import { validateLimit } from '../utils/validate';

const app = new Hono<{ Variables: AppVariables }>();

const VALID_CATEGORIES: TorrentCategory[] = ['video', 'audio', 'software', 'ebook', 'other'];

// GET /recent - Get recently indexed torrents
app.get('/', async (c) => {
  const limit = validateLimit(c.req.query('limit'), 50, 100);
  const category = c.req.query('category');

  // Validate category if provided
  if (category && !VALID_CATEGORIES.includes(category as TorrentCategory)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 400);
  }

  try {
    const results = await getRecentTorrents(limit, category);

    const response: ApiResponse<{ results: Torrent[] }> = {
      success: true,
      data: { results },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };

    return c.json(response);
  } catch (err) {
    console.error('Recent torrents error:', err);

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch recent torrents.',
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
