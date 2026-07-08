/**
 * Process-level crash guards.
 *
 * The server runs WebTorrent over WebRTC via node-datachannel. When a remote
 * peer aborts a data channel (a normal, high-frequency event) node-datachannel
 * surfaces an `OperationError` with `code: 'ERR_DATA_CHANNEL'` ("User-Initiated
 * Abort, reason=Close called"). These arrive as `uncaughtException`s with no
 * catchable call site, so a single peer disconnect was taking the whole Node
 * process down — the root cause of bittorrented.com going down repeatedly.
 *
 * This installs a narrow guard: swallow the known-benign WebRTC data-channel
 * aborts, but let every other uncaught exception exit the process so systemd
 * (Restart=always) restarts it cleanly.
 */
import { createLogger } from './logger';

const logger = createLogger('process-guards');

interface MaybeErrorLike {
  code?: string;
  message?: string;
}

/**
 * True for benign WebRTC/node-datachannel peer-abort errors that must not crash
 * the server (a peer closing its connection is expected, not a fault).
 */
function isBenignWebRtcError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message } = err as MaybeErrorLike;
  if (code === 'ERR_DATA_CHANNEL') return true;
  return /User-Initiated Abort|Close called|ERR_DATA_CHANNEL/i.test(String(message ?? ''));
}

let installed = false;

/**
 * Install uncaughtException / unhandledRejection handlers. Idempotent.
 */
export function installProcessGuards(): void {
  if (installed) return;
  installed = true;

  process.on('uncaughtException', (err) => {
    if (isBenignWebRtcError(err)) {
      logger.warn('Ignoring benign WebRTC data-channel abort', {
        code: (err as MaybeErrorLike).code,
        message: (err as MaybeErrorLike).message,
      });
      return;
    }
    // Preserve Node's default behaviour for real faults: log and exit so
    // systemd (Restart=always) brings us straight back up.
    logger.error('Fatal uncaughtException — exiting for restart', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    if (isBenignWebRtcError(reason)) {
      logger.warn('Ignoring benign WebRTC data-channel rejection', {
        message: (reason as MaybeErrorLike)?.message,
      });
      return;
    }
    // Log for triage but do not crash on unhandled rejections.
    logger.error('Unhandled promise rejection', reason);
  });

  logger.info('Process guards installed (uncaughtException/unhandledRejection)');
}
