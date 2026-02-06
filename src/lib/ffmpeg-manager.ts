/**
 * FFmpeg Process Manager
 * 
 * Tracks all spawned FFmpeg processes and provides:
 * - Process registry for monitoring
 * - Automatic timeout-based cleanup (default: 4 hours max runtime)
 * - Periodic orphan cleanup
 * - Graceful shutdown support
 */

import { type ChildProcess } from 'node:child_process';
import { createLogger } from './logger';

const logger = createLogger('FFmpegManager');

/**
 * Maximum runtime for any FFmpeg process (in milliseconds)
 * Default: 4 hours - no legitimate stream should run longer
 */
const MAX_PROCESS_RUNTIME_MS = 4 * 60 * 60 * 1000;

/**
 * Cleanup interval for orphaned processes (in milliseconds)
 * Default: 5 minutes
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Tracked FFmpeg process info
 */
interface TrackedProcess {
  id: string;
  process: ChildProcess;
  startedAt: Date;
  context: {
    infohash?: string;
    fileIndex?: number;
    fileName?: string;
    requestId?: string;
  };
  killTimeout: ReturnType<typeof setTimeout>;
}

/**
 * FFmpeg Process Manager Singleton
 */
class FFmpegProcessManager {
  private processes: Map<string, TrackedProcess> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private processCounter = 0;

  constructor() {
    this.startPeriodicCleanup();
    logger.info('FFmpegProcessManager initialized', {
      maxRuntimeHours: MAX_PROCESS_RUNTIME_MS / (60 * 60 * 1000),
      cleanupIntervalMinutes: CLEANUP_INTERVAL_MS / (60 * 1000),
    });
  }

  /**
   * Register a new FFmpeg process for tracking
   */
  register(
    process: ChildProcess,
    context: TrackedProcess['context'] = {}
  ): string {
    const id = `ffmpeg-${++this.processCounter}-${Date.now()}`;
    
    // Set up automatic kill timeout
    const killTimeout = setTimeout(() => {
      this.killProcess(id, 'timeout');
    }, MAX_PROCESS_RUNTIME_MS);

    const tracked: TrackedProcess = {
      id,
      process,
      startedAt: new Date(),
      context,
      killTimeout,
    };

    this.processes.set(id, tracked);

    // Clean up when process exits naturally
    process.on('close', () => {
      this.unregister(id);
    });

    process.on('exit', () => {
      this.unregister(id);
    });

    logger.debug('FFmpeg process registered', {
      id,
      pid: process.pid,
      context,
      activeCount: this.processes.size,
    });

    return id;
  }

  /**
   * Unregister a process (called when it exits naturally)
   */
  unregister(id: string): void {
    const tracked = this.processes.get(id);
    if (tracked) {
      clearTimeout(tracked.killTimeout);
      this.processes.delete(id);
      logger.debug('FFmpeg process unregistered', {
        id,
        pid: tracked.process.pid,
        runtimeMs: Date.now() - tracked.startedAt.getTime(),
        activeCount: this.processes.size,
      });
    }
  }

  /**
   * Kill a specific process
   */
  killProcess(id: string, reason: string): boolean {
    const tracked = this.processes.get(id);
    if (!tracked) return false;

    const runtimeMs = Date.now() - tracked.startedAt.getTime();
    
    logger.warn('Killing FFmpeg process', {
      id,
      pid: tracked.process.pid,
      reason,
      runtimeMs,
      runtimeMinutes: Math.round(runtimeMs / 60000),
      context: tracked.context,
    });

    try {
      // Try graceful SIGTERM first
      tracked.process.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        try {
          if (!tracked.process.killed) {
            tracked.process.kill('SIGKILL');
            logger.warn('Force killed FFmpeg process with SIGKILL', {
              id,
              pid: tracked.process.pid,
            });
          }
        } catch {
          // Process may already be dead
        }
      }, 5000);

      this.unregister(id);
      return true;
    } catch (error) {
      logger.error('Failed to kill FFmpeg process', error, { id });
      this.unregister(id);
      return false;
    }
  }

  /**
   * Get current stats
   */
  getStats(): {
    activeCount: number;
    processes: Array<{
      id: string;
      pid: number | undefined;
      runtimeMs: number;
      context: TrackedProcess['context'];
    }>;
  } {
    const now = Date.now();
    return {
      activeCount: this.processes.size,
      processes: Array.from(this.processes.values()).map((p) => ({
        id: p.id,
        pid: p.process.pid,
        runtimeMs: now - p.startedAt.getTime(),
        context: p.context,
      })),
    };
  }

  /**
   * Start periodic cleanup of orphaned processes
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOrphans();
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up orphaned processes
   * Kills any process that:
   * - Has been running longer than MAX_PROCESS_RUNTIME_MS
   * - Has a dead/zombied child process
   */
  private cleanupOrphans(): void {
    const now = Date.now();
    let killedCount = 0;

    for (const [id, tracked] of this.processes) {
      const runtimeMs = now - tracked.startedAt.getTime();

      // Check if process exceeded max runtime
      if (runtimeMs > MAX_PROCESS_RUNTIME_MS) {
        this.killProcess(id, 'exceeded_max_runtime');
        killedCount++;
        continue;
      }

      // Check if process is zombied (pid exists but process is dead)
      if (tracked.process.killed || tracked.process.exitCode !== null) {
        logger.debug('Cleaning up zombied process entry', { id });
        this.unregister(id);
        continue;
      }
    }

    if (killedCount > 0 || this.processes.size > 0) {
      logger.info('FFmpeg cleanup cycle completed', {
        killedCount,
        activeCount: this.processes.size,
      });
    }
  }

  /**
   * Kill all tracked processes (for graceful shutdown)
   */
  killAll(reason: string = 'shutdown'): void {
    logger.info('Killing all FFmpeg processes', {
      reason,
      count: this.processes.size,
    });

    for (const id of this.processes.keys()) {
      this.killProcess(id, reason);
    }
  }

  /**
   * Destroy the manager (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.killAll('destroy');
  }
}

// Singleton instance
let managerInstance: FFmpegProcessManager | null = null;

/**
 * Get the singleton FFmpeg process manager
 */
export function getFFmpegManager(): FFmpegProcessManager {
  if (!managerInstance) {
    managerInstance = new FFmpegProcessManager();
  }
  return managerInstance;
}

/**
 * Register process shutdown handlers
 */
if (typeof process !== 'undefined') {
  const cleanup = (): void => {
    if (managerInstance) {
      managerInstance.destroy();
    }
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.on('beforeExit', cleanup);
}
