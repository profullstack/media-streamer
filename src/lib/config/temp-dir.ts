/**
 * Temp Directory Configuration
 *
 * Centralizes temp directory configuration for all services that need to write
 * temporary files (WebTorrent, FFmpeg transcoding, etc.)
 *
 * On production servers, we use $HOME/tmp to avoid filling up the root partition.
 * The /tmp directory is typically on the root partition which may be small.
 *
 * Configuration:
 * - Set TEMP_DIR environment variable to customize the temp directory
 * - Default: $HOME/tmp (production) or system temp dir (development)
 */

import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { createLogger } from '../logger';

const logger = createLogger('TempDir');

/**
 * Get the base temp directory for all application temp files.
 *
 * Priority:
 * 1. TEMP_DIR environment variable (if set)
 * 2. $HOME/tmp (production - uses larger disk)
 * 3. System temp dir (development)
 */
export function getTempDir(): string {
  // Check for explicit environment variable
  if (process.env.TEMP_DIR) {
    return process.env.TEMP_DIR;
  }

  // On production, use $HOME/tmp to avoid filling up root partition
  if (process.env.NODE_ENV === 'production') {
    return join(homedir(), 'tmp');
  }

  // Development: use system temp dir
  return tmpdir();
}

/**
 * Get the WebTorrent download directory.
 * WebTorrent stores downloaded torrent data here.
 */
export function getWebTorrentDir(): string {
  return join(getTempDir(), 'webtorrent');
}

/**
 * Get the transcoding temp directory.
 * FFmpeg stores temporary files during transcoding here.
 */
export function getTranscodingDir(): string {
  return join(getTempDir(), 'media-torrent-transcoding');
}

/**
 * Ensure a directory exists, creating it if necessary.
 * Creates parent directories as needed.
 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info('Created temp directory', { dir });
  }
}

/**
 * Initialize all temp directories.
 * Call this at application startup to ensure directories exist.
 */
export function initTempDirs(): void {
  const baseDir = getTempDir();
  const webTorrentDir = getWebTorrentDir();
  const transcodingDir = getTranscodingDir();

  logger.info('Initializing temp directories', {
    baseDir,
    webTorrentDir,
    transcodingDir,
    nodeEnv: process.env.NODE_ENV,
  });

  ensureDir(baseDir);
  ensureDir(webTorrentDir);
  ensureDir(transcodingDir);
}

// Export the directories as constants for convenience
export const TEMP_DIR = getTempDir();
export const WEBTORRENT_DIR = getWebTorrentDir();
export const TRANSCODING_DIR = getTranscodingDir();
