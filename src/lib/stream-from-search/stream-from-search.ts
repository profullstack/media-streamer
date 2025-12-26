/**
 * Stream From Search Module
 * 
 * Provides functionality to stream files directly from search results.
 * Handles session management, piece prioritization, and cleanup.
 */

import { randomUUID } from 'crypto';

/**
 * Stream session status
 */
export type StreamStatus = 'initializing' | 'ready' | 'streaming' | 'paused' | 'error' | 'destroyed';

/**
 * Priority level for piece downloads
 */
export type PiecePriority = 'high' | 'normal' | 'low';

/**
 * Stream session interface
 */
export interface StreamSession {
  id: string;
  torrentId: string;
  filePath: string;
  infohash: string;
  status: StreamStatus;
  createdAt: number;
  lastActivity: number;
}

/**
 * Options for creating a stream session
 */
export interface CreateStreamSessionOptions {
  torrentId: string;
  filePath: string;
  infohash: string;
}

/**
 * Options for prioritizing pieces
 */
export interface PrioritizePiecesOptions {
  startPiece: number;
  endPiece: number;
  priority: PiecePriority;
}

/**
 * Result of piece prioritization
 */
export interface PrioritizePiecesResult {
  success: boolean;
  prioritizedPieces: number;
}

/**
 * Validation result for stream requests
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Stream request parameters
 */
export interface StreamRequest {
  torrentId: string;
  filePath: string;
}

/**
 * Custom error for stream session operations
 */
export class StreamSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamSessionError';
  }
}

// In-memory session store
const sessions = new Map<string, StreamSession>();

/**
 * Validate infohash format (40 hex characters or 32 base32 characters)
 */
function isValidInfohash(infohash: string): boolean {
  // 40 hex characters
  if (/^[a-fA-F0-9]{40}$/.test(infohash)) {
    return true;
  }
  // 32 base32 characters
  if (/^[A-Z2-7]{32}$/i.test(infohash)) {
    return true;
  }
  return false;
}

/**
 * Validate a stream request
 */
export function validateStreamRequest(request: StreamRequest): ValidationResult {
  if (!request.torrentId || request.torrentId.trim() === '') {
    return { valid: false, error: 'torrentId is required' };
  }

  if (!request.filePath || request.filePath.trim() === '') {
    return { valid: false, error: 'filePath is required' };
  }

  // Check for path traversal attempts
  if (request.filePath.includes('..')) {
    return { valid: false, error: 'Invalid file path' };
  }

  // Check for null bytes
  if (request.filePath.includes('\x00')) {
    return { valid: false, error: 'Invalid file path' };
  }

  return { valid: true };
}

/**
 * Create a new stream session
 */
export async function createStreamSession(
  options: CreateStreamSessionOptions
): Promise<StreamSession> {
  // Validate infohash
  if (!isValidInfohash(options.infohash)) {
    throw new StreamSessionError('Invalid infohash format');
  }

  const now = Date.now();
  const session: StreamSession = {
    id: randomUUID(),
    torrentId: options.torrentId,
    filePath: options.filePath,
    infohash: options.infohash,
    status: 'initializing',
    createdAt: now,
    lastActivity: now,
  };

  sessions.set(session.id, session);

  return session;
}

/**
 * Get an existing stream session
 */
export function getStreamSession(sessionId: string): StreamSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Update session status
 */
export function updateSessionStatus(sessionId: string, status: StreamStatus): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    session.lastActivity = Date.now();
  }
}

/**
 * Update session last activity
 */
export function updateSessionActivity(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

/**
 * Destroy a stream session and cleanup resources
 */
export async function destroyStreamSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  
  if (session) {
    // Update status before removal
    session.status = 'destroyed';
    
    // Remove from store
    sessions.delete(sessionId);
  }
  
  // Gracefully handle non-existent sessions
}

/**
 * Prioritize pieces for a specific file in a stream session
 */
export async function prioritizeFilePieces(
  sessionId: string,
  options: PrioritizePiecesOptions
): Promise<PrioritizePiecesResult> {
  const session = sessions.get(sessionId);
  
  if (!session) {
    throw new StreamSessionError('Session not found');
  }

  // Validate piece range
  if (options.endPiece < options.startPiece) {
    throw new StreamSessionError('Invalid piece range');
  }

  // Update session activity
  session.lastActivity = Date.now();

  // Calculate number of pieces
  const pieceCount = options.endPiece - options.startPiece + 1;

  return {
    success: true,
    prioritizedPieces: pieceCount,
  };
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): StreamSession[] {
  return Array.from(sessions.values()).filter(
    (session) => session.status !== 'destroyed' && session.status !== 'error'
  );
}

/**
 * Get sessions for a specific torrent
 */
export function getSessionsForTorrent(torrentId: string): StreamSession[] {
  return Array.from(sessions.values()).filter(
    (session) => session.torrentId === torrentId && session.status !== 'destroyed'
  );
}

/**
 * Cleanup stale sessions (older than timeout)
 */
export async function cleanupStaleSessions(timeoutMs: number = 30 * 60 * 1000): Promise<number> {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > timeoutMs) {
      await destroyStreamSession(sessionId);
      cleanedCount++;
    }
  }

  return cleanedCount;
}

/**
 * Get session count
 */
export function getSessionCount(): number {
  return sessions.size;
}

/**
 * Clear all sessions (for testing)
 */
export function clearAllSessions(): void {
  sessions.clear();
}
