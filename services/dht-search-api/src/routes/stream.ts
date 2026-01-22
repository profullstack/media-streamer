import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppVariables, Torrent, TorrentCategory } from '../types';
import { getDb } from '../services/db';
import { formatBytes } from '../utils/format';
import { buildMagnetUri } from '../utils/magnet';

const app = new Hono<{ Variables: AppVariables }>();

const VALID_CATEGORIES: TorrentCategory[] = ['video', 'audio', 'software', 'ebook', 'other'];

// GET /stream - Stream new torrents via SSE
app.get('/', async (c) => {
  const apiKey = c.get('apiKey');

  // Check if tier allows SSE
  if (apiKey && !['pro', 'enterprise'].includes(apiKey.tier)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'SSE streaming requires Pro or Enterprise tier.',
        },
        meta: {
          request_id: c.get('requestId'),
          took_ms: Date.now() - c.get('startTime'),
        },
      },
      403
    );
  }

  const filter = c.req.query('filter');
  const category = c.req.query('category');

  // Validate category if provided
  if (category && !VALID_CATEGORIES.includes(category as TorrentCategory)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        },
        meta: {
          request_id: c.get('requestId'),
          took_ms: Date.now() - c.get('startTime'),
        },
      },
      400
    );
  }

  return streamSSE(c, async (stream) => {
    const db = getDb();
    let lastId: string | null = null;
    let isActive = true;

    // Handle client disconnect
    c.req.raw.signal.addEventListener('abort', () => {
      isActive = false;
    });

    // Send initial heartbeat
    await stream.writeSSE({
      event: 'heartbeat',
      data: JSON.stringify({ timestamp: new Date().toISOString(), status: 'connected' }),
    });

    // Poll for new torrents
    while (isActive) {
      try {
        let query = db
          .from('v_dht_torrents')
          .select('*')
          .order('discovered_at', { ascending: false })
          .limit(10);

        if (lastId) {
          query = query.gt('discovered_at', lastId);
        }

        if (category) {
          query = query.eq('category', category);
        }

        if (filter) {
          query = query.ilike('name', `%${filter}%`);
        }

        const { data, error } = await query;

        if (!error && data && data.length > 0) {
          // Update last ID
          lastId = data[0].discovered_at;

          // Send each torrent as an event
          for (const row of data.reverse()) {
            const torrent: Partial<Torrent> = {
              infohash: row.infohash,
              name: row.name,
              size: row.size,
              size_formatted: formatBytes(row.size),
              files_count: row.files_count,
              category: row.category,
              seeders: row.seeders,
              leechers: row.leechers,
              discovered_at: row.discovered_at,
              magnet: row.magnet || buildMagnetUri(row.infohash, row.name),
            };

            await stream.writeSSE({
              event: 'torrent',
              data: JSON.stringify(torrent),
            });
          }
        }

        // Send heartbeat every 30 seconds
        await stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (err) {
        console.error('SSE stream error:', err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: 'Stream error, reconnecting...' }),
        });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  });
});

export default app;
