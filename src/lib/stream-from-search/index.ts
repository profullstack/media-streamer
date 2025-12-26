/**
 * Stream From Search Module
 * 
 * Exports for streaming files directly from search results
 */

export {
  createStreamSession,
  getStreamSession,
  destroyStreamSession,
  prioritizeFilePieces,
  validateStreamRequest,
  updateSessionStatus,
  updateSessionActivity,
  getActiveSessions,
  getSessionsForTorrent,
  cleanupStaleSessions,
  getSessionCount,
  clearAllSessions,
  StreamSessionError,
} from './stream-from-search';

export type {
  StreamSession,
  StreamStatus,
  PiecePriority,
  CreateStreamSessionOptions,
  PrioritizePiecesOptions,
  PrioritizePiecesResult,
  ValidationResult,
  StreamRequest,
} from './stream-from-search';
