import { serve } from '@hono/node-server';
import app from './app';
import { getRedis } from './services/cache';

const PORT = parseInt(process.env.PORT || '3333', 10);

// Initialize Redis connection (non-blocking)
getRedis();

console.log(
  JSON.stringify({
    level: 'info',
    ts: new Date().toISOString(),
    msg: 'starting server',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
  })
);

// Start server
const server = serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(
  JSON.stringify({
    level: 'info',
    ts: new Date().toISOString(),
    msg: 'server started',
    port: PORT,
    hostname: '0.0.0.0',
  })
);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(
    JSON.stringify({
      level: 'info',
      ts: new Date().toISOString(),
      msg: 'received SIGTERM, shutting down',
    })
  );
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(
    JSON.stringify({
      level: 'info',
      ts: new Date().toISOString(),
      msg: 'received SIGINT, shutting down',
    })
  );
  server.close();
  process.exit(0);
});
