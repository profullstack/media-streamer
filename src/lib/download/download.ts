/**
 * Download Module
 * 
 * Handles file downloads for premium users
 * Supports individual files and entire torrents
 */

import { randomUUID } from 'crypto';

// Types
export type DownloadStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'failed';
export type SubscriptionTier = 'free' | 'premium' | 'family';

export interface DownloadRequest {
  id: string;
  userId: string;
  infohash: string;
  fileIndex: number; // -1 for entire torrent
  filename: string;
  fileSize: number;
  createdAt: Date;
  status: DownloadStatus;
}

export interface DownloadSession {
  id: string;
  userId: string;
  requestId: string;
  totalSize: number;
  downloadedSize: number;
  status: DownloadStatus;
  startedAt: Date;
  completedAt?: Date;
}

export interface DownloadProgress {
  percentage: number;
  downloadedSize: number;
  totalSize: number;
  remainingSize: number;
}

export interface DownloadTimeEstimate {
  seconds: number;
  formatted: string;
}

export interface FileInfo {
  index: number;
  size: number;
}

export interface CreateDownloadRequestOptions {
  userId: string;
  infohash: string;
  fileIndex: number;
  filename: string;
  fileSize: number;
}

export interface CreateDownloadSessionOptions {
  userId: string;
  requestId: string;
  totalSize: number;
}

export interface GetDownloadUrlOptions {
  infohash: string;
  fileIndex: number;
  token: string;
}

/**
 * Create a download request
 */
export function createDownloadRequest(options: CreateDownloadRequestOptions): DownloadRequest {
  return {
    id: `dl-${randomUUID()}`,
    userId: options.userId,
    infohash: options.infohash,
    fileIndex: options.fileIndex,
    filename: options.filename,
    fileSize: options.fileSize,
    createdAt: new Date(),
    status: 'pending',
  };
}

/**
 * Validate a download request
 */
export function validateDownloadRequest(request: DownloadRequest): boolean {
  if (!request.userId || request.userId.trim() === '') {
    return false;
  }
  
  if (!request.infohash || request.infohash.trim() === '') {
    return false;
  }
  
  // fileIndex must be >= -1 (-1 means entire torrent)
  if (request.fileIndex < -1) {
    return false;
  }
  
  return true;
}

/**
 * Check if user can download based on subscription tier
 */
export function canUserDownload(tier: SubscriptionTier): boolean {
  return tier === 'premium' || tier === 'family';
}

/**
 * Generate download URL
 */
export function getDownloadUrl(options: GetDownloadUrlOptions): string {
  const params = new URLSearchParams({
    infohash: options.infohash,
    fileIndex: options.fileIndex.toString(),
    token: options.token,
  });
  
  return `/api/download?${params.toString()}`;
}

/**
 * Format download filename
 */
export function formatDownloadFilename(filename: string, _infohash: string): string {
  return sanitizeFilename(filename);
}

/**
 * Sanitize filename for safe download
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || filename.trim() === '') {
    return 'download';
  }
  
  // Trim whitespace
  let sanitized = filename.trim();
  
  // Replace dangerous characters
  sanitized = sanitized.replace(/[/\\:*?"<>|]/g, '_');
  
  return sanitized;
}

/**
 * Generate Content-Disposition header
 */
export function getContentDisposition(
  filename: string,
  disposition: 'attachment' | 'inline'
): string {
  const sanitized = sanitizeFilename(filename);
  
  // Check if filename needs encoding (has special chars)
  const needsEncoding = /[^\x20-\x7E]|[()']/.test(sanitized);
  
  if (needsEncoding) {
    const encoded = encodeURIComponent(sanitized);
    return `${disposition}; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
  }
  
  return `${disposition}; filename="${sanitized}"`;
}

/**
 * Calculate total download size
 */
export function calculateDownloadSize(files: FileInfo[], fileIndex: number): number {
  if (fileIndex === -1) {
    // Entire torrent - sum all files
    return files.reduce((total, file) => total + file.size, 0);
  }
  
  // Single file
  const file = files.find(f => f.index === fileIndex);
  return file ? file.size : 0;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  
  if (bytes < k) {
    return `${bytes} B`;
  }
  
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const size = bytes / Math.pow(k, i);
  
  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Estimate download time
 */
export function estimateDownloadTime(
  fileSize: number,
  speedBytesPerSecond: number
): DownloadTimeEstimate {
  if (speedBytesPerSecond === 0) {
    return {
      seconds: Infinity,
      formatted: 'Unknown',
    };
  }
  
  const seconds = fileSize / speedBytesPerSecond;
  
  let formatted: string;
  if (seconds < 60) {
    formatted = seconds === 1 ? '1 second' : `${Math.round(seconds)} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    formatted = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  } else {
    const hours = Math.round(seconds / 3600);
    formatted = hours === 1 ? '1 hour' : `${hours} hours`;
  }
  
  return {
    seconds,
    formatted,
  };
}

/**
 * Create download session
 */
export function createDownloadSession(options: CreateDownloadSessionOptions): DownloadSession {
  return {
    id: `session-${randomUUID()}`,
    userId: options.userId,
    requestId: options.requestId,
    totalSize: options.totalSize,
    downloadedSize: 0,
    status: 'active',
    startedAt: new Date(),
  };
}

/**
 * Get download progress
 */
export function getDownloadProgress(session: DownloadSession): DownloadProgress {
  const percentage = Math.min(
    Math.round((session.downloadedSize / session.totalSize) * 100),
    100
  );
  
  const remainingSize = Math.max(session.totalSize - session.downloadedSize, 0);
  
  return {
    percentage,
    downloadedSize: session.downloadedSize,
    totalSize: session.totalSize,
    remainingSize,
  };
}

/**
 * Update download progress
 */
export function updateDownloadProgress(
  session: DownloadSession,
  downloadedSize: number
): DownloadSession {
  return {
    ...session,
    downloadedSize,
  };
}

/**
 * Complete download
 */
export function completeDownload(session: DownloadSession): DownloadSession {
  return {
    ...session,
    status: 'completed',
    completedAt: new Date(),
  };
}

/**
 * Cancel download
 */
export function cancelDownload(session: DownloadSession): DownloadSession {
  return {
    ...session,
    status: 'cancelled',
  };
}

/**
 * Get active downloads for user
 */
export function getActiveDownloads(
  sessions: DownloadSession[],
  userId: string
): DownloadSession[] {
  return sessions.filter(
    session => session.userId === userId && session.status === 'active'
  );
}

/**
 * Cleanup expired downloads
 */
export function cleanupExpiredDownloads(
  sessions: DownloadSession[],
  expiryMs: number
): DownloadSession[] {
  const now = Date.now();
  
  return sessions.filter(session => {
    const age = now - session.startedAt.getTime();
    return age < expiryMs;
  });
}
