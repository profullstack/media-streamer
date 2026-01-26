/**
 * Centralized Logger for BitTorrented
 * 
 * Provides structured logging for both server-side and client-side code.
 * Supports different log levels and contextual information.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Service or module name */
  service?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  data?: unknown;
}

/**
 * Check if we're running on the server
 */
function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Get the current log level from environment
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error') {
    return envLevel;
  }
  // Default to 'debug' in development, 'info' in production
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

/**
 * Format error for logging
 * Handles both Error instances and plain objects/values
 */
function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  // Handle plain objects (e.g., WebTorrent errors that aren't Error instances)
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    // Try to extract meaningful error information from the object
    const message = errObj.message ?? errObj.error ?? errObj.reason ?? errObj.code;
    return {
      name: String(errObj.name ?? errObj.type ?? 'UnknownError'),
      message: message ? String(message) : JSON.stringify(error),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
  data?: unknown
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    error: formatError(error),
    data,
  };
}

/**
 * Output log entry to console
 */
function outputLog(entry: LogEntry): void {
  const prefix = isServer() ? '[SERVER]' : '[CLIENT]';
  const contextStr = entry.context?.service ? `[${entry.context.service}]` : '';
  const requestIdStr = entry.context?.requestId ? `[req:${entry.context.requestId}]` : '';
  
  const formattedMessage = `${prefix}${contextStr}${requestIdStr} ${entry.message}`;
  
  // Build log arguments
  const logArgs: unknown[] = [formattedMessage];
  
  if (entry.data !== undefined) {
    logArgs.push('\nData:', entry.data);
  }
  
  if (entry.error) {
    logArgs.push('\nError:', entry.error);
  }
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    // Filter out service and requestId as they're already in the prefix
    const { service, requestId, ...restContext } = entry.context;
    if (Object.keys(restContext).length > 0) {
      logArgs.push('\nContext:', restContext);
    }
  }
  
  switch (entry.level) {
    case 'debug':
      console.debug(...logArgs);
      break;
    case 'info':
      console.info(...logArgs);
      break;
    case 'warn':
      console.warn(...logArgs);
      break;
    case 'error':
      console.error(...logArgs);
      break;
  }
}

/**
 * Logger class for creating scoped loggers
 */
export class Logger {
  private context: LogContext;
  
  constructor(context: LogContext = {}) {
    this.context = context;
  }
  
  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown): void {
    if (!shouldLog('debug')) return;
    const entry = createLogEntry('debug', message, this.context, undefined, data);
    outputLog(entry);
  }
  
  /**
   * Log an info message
   */
  info(message: string, data?: unknown): void {
    if (!shouldLog('info')) return;
    const entry = createLogEntry('info', message, this.context, undefined, data);
    outputLog(entry);
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    if (!shouldLog('warn')) return;
    const entry = createLogEntry('warn', message, this.context, undefined, data);
    outputLog(entry);
  }
  
  /**
   * Log an error message
   */
  error(message: string, error?: unknown, data?: unknown): void {
    if (!shouldLog('error')) return;
    const entry = createLogEntry('error', message, this.context, error, data);
    outputLog(entry);
  }
  
  /**
   * Log the start of an operation (for timing)
   */
  startOperation(operationName: string, data?: unknown): () => void {
    const startTime = Date.now();
    this.debug(`Starting: ${operationName}`, data);
    
    return () => {
      const duration = Date.now() - startTime;
      this.debug(`Completed: ${operationName}`, { duration: `${duration}ms`, ...((data as object) ?? {}) });
    };
  }
  
  /**
   * Log an async operation with timing
   */
  async withTiming<T>(operationName: string, fn: () => Promise<T>, data?: unknown): Promise<T> {
    const endOperation = this.startOperation(operationName, data);
    try {
      const result = await fn();
      endOperation();
      return result;
    } catch (error) {
      this.error(`Failed: ${operationName}`, error, data);
      throw error;
    }
  }
}

/**
 * Create a logger for a specific service
 */
export function createLogger(service: string): Logger {
  return new Logger({ service });
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Default logger instance
 */
export const logger = new Logger();
