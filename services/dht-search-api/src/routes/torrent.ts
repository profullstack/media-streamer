import { Hono } from 'hono';
import type { AppVariables, ApiResponse, TorrentDetails } from '../types';
import { getTorrentByInfohash } from '../services/search';
import { validateInfohash } from '../utils/validate';

const app = new Hono<{ Variables: AppVariables }>();

// GET /torrent/:infohash - Get torrent details
app.get('/:infohash', async (c) => {
  const infohash = c.req.param('infohash');

  // Validate infohash
  if (!validateInfohash(infohash)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: 'Invalid infohash. Must be 40 hexadecimal characters.',
      },
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };
    return c.json(response, 400);
  }

  try {
    const torrent = await getTorrentByInfohash(infohash);

    if (!torrent) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Torrent not found.',
        },
        meta: {
          request_id: c.get('requestId'),
          took_ms: Date.now() - c.get('startTime'),
        },
      };
      return c.json(response, 404);
    }

    const response: ApiResponse<TorrentDetails> = {
      success: true,
      data: torrent,
      meta: {
        request_id: c.get('requestId'),
        took_ms: Date.now() - c.get('startTime'),
      },
    };

    return c.json(response);
  } catch (err) {
    console.error('Torrent lookup error:', err);

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch torrent details.',
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
