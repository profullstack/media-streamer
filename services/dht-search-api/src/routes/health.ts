import { Hono } from 'hono';
import type { AppVariables, HealthCheck } from '../types';
import { checkDbHealth } from '../services/db';
import { checkRedisHealth, isRedisEnabled } from '../services/cache';

const app = new Hono<{ Variables: AppVariables }>();

const startTime = Date.now();
const VERSION = '1.0.0';

// GET /health - Health check
app.get('/', async (c) => {
  const [dbHealthy, redisHealthy] = await Promise.all([
    checkDbHealth(),
    isRedisEnabled() ? checkRedisHealth() : Promise.resolve(true),
  ]);

  const checks: HealthCheck['checks'] = {
    database: dbHealthy ? 'ok' : 'error',
  };

  if (isRedisEnabled()) {
    checks.redis = redisHealthy ? 'ok' : 'error';
  } else {
    checks.redis = 'disabled';
  }

  const allHealthy = dbHealthy && (isRedisEnabled() ? redisHealthy : true);

  const health: HealthCheck = {
    status: allHealthy ? 'healthy' : 'degraded',
    version: VERSION,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  return c.json(health, allHealthy ? 200 : 503);
});

export default app;
