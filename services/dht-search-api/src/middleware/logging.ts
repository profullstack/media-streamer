import type { MiddlewareHandler } from 'hono';
import type { AppVariables } from '../types';
import { generateRequestId } from '../utils/format';
import { logRequest } from '../services/usage';

// Request logging middleware
export const loggingMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (
  c,
  next
) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Set context variables
  c.set('requestId', requestId);
  c.set('startTime', startTime);

  // Set request ID header
  c.header('X-Request-ID', requestId);

  // Log request start
  const logLevel = process.env.LOG_LEVEL || 'info';
  if (logLevel === 'debug') {
    console.log(
      JSON.stringify({
        level: 'debug',
        ts: new Date().toISOString(),
        msg: 'request started',
        request_id: requestId,
        method: c.req.method,
        path: c.req.path,
        ip: getClientIp(c),
      })
    );
  }

  await next();

  // Calculate response time
  const responseTime = Date.now() - startTime;
  const statusCode = c.res.status;

  // Log request completion
  console.log(
    JSON.stringify({
      level: 'info',
      ts: new Date().toISOString(),
      msg: 'request completed',
      request_id: requestId,
      method: c.req.method,
      path: c.req.path,
      status: statusCode,
      duration_ms: responseTime,
      api_key: c.get('apiKey')?.key_prefix || 'anonymous',
      ip: getClientIp(c),
    })
  );

  // Log to database if authenticated
  const apiKey = c.get('apiKey');
  if (apiKey) {
    // Fire and forget - don't await
    logRequest(
      apiKey.id,
      c.req.path,
      c.req.method,
      statusCode,
      responseTime,
      getClientIp(c),
      c.req.header('User-Agent') || 'unknown',
      Object.fromEntries(new URL(c.req.url).searchParams)
    ).catch((err) => {
      console.error('Failed to log request:', err);
    });
  }
};

// Get client IP from headers or connection
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    c.req.header('X-Real-IP') ||
    c.req.header('CF-Connecting-IP') ||
    'unknown'
  );
}
