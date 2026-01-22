import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppVariables } from './types';
import { loggingMiddleware } from './middleware/logging';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errors';

// Routes
import searchRoute from './routes/search';
import torrentRoute from './routes/torrent';
import recentRoute from './routes/recent';
import statsRoute from './routes/stats';
import streamRoute from './routes/stream';
import meRoute from './routes/me';
import healthRoute from './routes/health';

// Create app
const app = new Hono<{ Variables: AppVariables }>();

// Global middleware
app.use('*', cors());
app.use('*', loggingMiddleware);

// Error handling
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Public routes (no auth required)
app.route('/health', healthRoute);

// API v1 routes (auth required)
const v1 = new Hono<{ Variables: AppVariables }>();

// Apply auth and rate limiting to all v1 routes
v1.use('*', authMiddleware);
v1.use('*', rateLimitMiddleware);

// Mount routes
v1.route('/search', searchRoute);
v1.route('/torrent', torrentRoute);
v1.route('/recent', recentRoute);
v1.route('/stats', statsRoute);
v1.route('/stream', streamRoute);
v1.route('/me', meRoute);

app.route('/v1', v1);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'DHT Search API',
    version: '1.0.0',
    docs: 'https://api.yourdomain.com/docs',
    endpoints: {
      search: 'GET /v1/search?q=<query>',
      torrent: 'GET /v1/torrent/:infohash',
      recent: 'GET /v1/recent',
      stats: 'GET /v1/stats',
      stream: 'GET /v1/stream (SSE)',
      me: 'GET /v1/me',
      health: 'GET /health',
    },
  });
});

export default app;
