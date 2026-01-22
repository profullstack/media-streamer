import type { ErrorHandler } from 'hono';
import type { AppVariables, ApiResponse } from '../types';

// Global error handler
export const errorHandler: ErrorHandler<{ Variables: AppVariables }> = (err, c) => {
  console.error(
    JSON.stringify({
      level: 'error',
      ts: new Date().toISOString(),
      msg: 'unhandled error',
      request_id: c.get('requestId'),
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    })
  );

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : 'An internal error occurred. Please try again later.',
      details:
        process.env.NODE_ENV === 'development'
          ? { stack: err.stack }
          : undefined,
    },
    meta: {
      request_id: c.get('requestId') || 'unknown',
      took_ms: c.get('startTime') ? Date.now() - c.get('startTime') : 0,
    },
  };

  return c.json(response, 500);
};

// Not found handler
export const notFoundHandler = (c: { json: (body: unknown, status: number) => Response }) => {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist.',
    },
  };

  return c.json(response, 404);
};
