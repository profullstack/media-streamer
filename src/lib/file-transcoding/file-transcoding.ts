/**
 * File-based Transcoding Service
 *
 * Handles transcoding for MP4/MOV files that cannot be transcoded via pipe
 * because the moov atom (metadata) is at the end of the file.
 *
 * Strategy:
 * 1. Download the file to {TEMP_DIR}/{infohash}_{fileIndex}.{ext}
 * 2. Once the file is complete (or has enough data), start FFmpeg transcoding from the file
 * 3. Stream the transcoded output back to the client
 * 4. Clean up temp files after streaming completes
 *
 * Temp Directory Configuration:
 * - Set TEMP_DIR environment variable to customize the base temp directory
 * - Default: $HOME/tmp (production) or system temp dir (development)
 *
 * Cleanup:
 * - Files are cleaned up immediately after transcoding completes
 * - Periodic cleanup runs every hour to remove orphaned files older than 1 hour
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger';
import { getTranscodingDir, ensureDir } from '../config';

const logger = createLogger('FileTranscoding');

/**
 * Temp directory for downloaded files
 * Uses the centralized config from ../config
 */
export const TEMP_DIR = getTranscodingDir();

/**
 * Maximum age of temp files before cleanup (in milliseconds)
 * Default: 1 hour
 */
const MAX_TEMP_FILE_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Cleanup interval (in milliseconds)
 * Default: 1 hour
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Formats that require file-based transcoding (moov atom at end)
 */
const FILE_BASED_FORMATS = new Set(['mp4', 'm4v', 'mov', 'm4a', '3gp', '3g2']);

/**
 * Options for FileTranscodingService
 */
export interface FileTranscodingServiceOptions {
  /** Maximum concurrent downloads (default: 3) */
  maxConcurrentDownloads?: number;
  /** Download timeout in milliseconds (default: 300000 = 5 minutes) */
  downloadTimeout?: number;
  /** Minimum bytes before starting transcoding (default: 50MB) */
  minBytesBeforeTranscode?: number;
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  infohash: string;
  fileIndex: number;
  bytesDownloaded: number;
  totalBytes: number;
  progress: number;
  filePath: string;
  startedAt: Date;
}

/**
 * Active download tracking
 */
interface ActiveDownload {
  id: string;
  infohash: string;
  fileIndex: number;
  filePath: string;
  bytesDownloaded: number;
  totalBytes: number;
  writeStream: ReturnType<typeof createWriteStream>;
  startedAt: Date;
  abortController: AbortController;
}

/**
 * Active transcode tracking
 */
interface ActiveTranscode {
  id: string;
  infohash: string;
  fileIndex: number;
  filePath: string;
  ffmpegProcess: ChildProcess;
  outputStream: PassThrough;
  startedAt: Date;
}

/**
 * Get the temp file path for a download
 */
export function getTempFilePath(infohash: string, fileIndex: number, extension: string): string {
  const sanitizedInfohash = infohash.toLowerCase().replace(/[^a-f0-9]/g, '');
  return join(TEMP_DIR, `${sanitizedInfohash}_${fileIndex}.${extension}`);
}

/**
 * Check if a file format requires file-based transcoding
 */
export function isFileBasedTranscodingRequired(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? FILE_BASED_FORMATS.has(ext) : false;
}

/**
 * Clean up a temp file
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
    logger.debug('Cleaned up temp file', { filePath });
  } catch (error) {
    logger.warn('Failed to clean up temp file', { filePath, error: String(error) });
  }
}

/**
 * Ensure temp directory exists
 */
async function ensureTempDir(): Promise<void> {
  ensureDir(TEMP_DIR);
}

/**
 * Clean up old temp files that may have been orphaned
 * This runs periodically to prevent disk space from filling up
 */
async function cleanupOldTempFiles(): Promise<void> {
  try {
    // Ensure directory exists first
    await ensureTempDir();
    
    const files = await readdir(TEMP_DIR);
    const now = Date.now();
    let cleanedCount = 0;
    let cleanedBytes = 0;
    
    for (const file of files) {
      const filePath = join(TEMP_DIR, file);
      try {
        const fileStat = await stat(filePath);
        const fileAge = now - fileStat.mtimeMs;
        
        if (fileAge > MAX_TEMP_FILE_AGE_MS) {
          const fileSize = fileStat.size;
          await rm(filePath, { force: true });
          cleanedCount++;
          cleanedBytes += fileSize;
          logger.debug('Cleaned up old temp file', {
            filePath,
            ageMinutes: Math.round(fileAge / 60000),
            sizeMB: (fileSize / (1024 * 1024)).toFixed(2),
          });
        }
      } catch (fileError) {
        // File may have been deleted by another process
        logger.debug('Could not stat/delete temp file', {
          filePath,
          error: String(fileError),
        });
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('Periodic temp file cleanup completed', {
        cleanedCount,
        cleanedMB: (cleanedBytes / (1024 * 1024)).toFixed(2),
        tempDir: TEMP_DIR,
      });
    }
  } catch (error) {
    logger.warn('Failed to run periodic temp file cleanup', {
      error: String(error),
      tempDir: TEMP_DIR,
    });
  }
}

/**
 * File-based Transcoding Service
 *
 * Downloads MP4/MOV files to disk before transcoding to handle
 * the moov atom issue.
 */
export class FileTranscodingService {
  private maxConcurrentDownloads: number;
  private downloadTimeout: number;
  private minBytesBeforeTranscode: number;
  private activeDownloads: Map<string, ActiveDownload>;
  private activeTranscodes: Map<string, ActiveTranscode>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: FileTranscodingServiceOptions = {}) {
    this.maxConcurrentDownloads = options.maxConcurrentDownloads ?? 3;
    this.downloadTimeout = options.downloadTimeout ?? 900000; // 15 minutes (large x265 files need more time)
    this.minBytesBeforeTranscode = options.minBytesBeforeTranscode ?? 15 * 1024 * 1024; // 15MB
    this.activeDownloads = new Map();
    this.activeTranscodes = new Map();

    logger.info('FileTranscodingService initialized', {
      maxConcurrentDownloads: this.maxConcurrentDownloads,
      downloadTimeout: this.downloadTimeout,
      minBytesBeforeTranscode: this.minBytesBeforeTranscode,
      tempDir: TEMP_DIR,
      maxTempFileAgeMinutes: MAX_TEMP_FILE_AGE_MS / 60000,
      cleanupIntervalMinutes: CLEANUP_INTERVAL_MS / 60000,
    });

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup of old temp files
   */
  private startPeriodicCleanup(): void {
    // Run cleanup immediately on startup
    cleanupOldTempFiles().catch((err) => {
      logger.warn('Initial temp file cleanup failed', { error: String(err) });
    });

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      cleanupOldTempFiles().catch((err) => {
        logger.warn('Periodic temp file cleanup failed', { error: String(err) });
      });
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    logger.debug('Periodic temp file cleanup scheduled', {
      intervalMinutes: CLEANUP_INTERVAL_MS / 60000,
    });
  }

  /**
   * Stop periodic cleanup
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('Periodic temp file cleanup stopped');
    }
  }

  /**
   * Get the number of active downloads
   */
  getActiveDownloadCount(): number {
    return this.activeDownloads.size;
  }

  /**
   * Get the number of active transcodes
   */
  getActiveTranscodeCount(): number {
    return this.activeTranscodes.size;
  }

  /**
   * Check if a specific infohash has an active transcode/remux
   */
  hasActiveTranscode(infohash: string): boolean {
    for (const [key] of this.activeTranscodes) {
      if (key.startsWith(infohash)) return true;
    }
    return false;
  }

  /**
   * Check if a file is currently being downloaded
   */
  isDownloading(infohash: string, fileIndex: number): boolean {
    const key = `${infohash}_${fileIndex}`;
    return this.activeDownloads.has(key);
  }

  /**
   * Get download progress for a file
   */
  getDownloadProgress(infohash: string, fileIndex: number): DownloadProgress | null {
    const key = `${infohash}_${fileIndex}`;
    const download = this.activeDownloads.get(key);
    if (!download) return null;

    return {
      infohash: download.infohash,
      fileIndex: download.fileIndex,
      bytesDownloaded: download.bytesDownloaded,
      totalBytes: download.totalBytes,
      progress: download.totalBytes > 0 ? download.bytesDownloaded / download.totalBytes : 0,
      filePath: download.filePath,
      startedAt: download.startedAt,
    };
  }

  /**
   * Download a file from a torrent stream to disk
   *
   * @param sourceStream - The source stream from WebTorrent
   * @param infohash - The torrent infohash
   * @param fileIndex - The file index in the torrent
   * @param fileName - The original file name
   * @param totalBytes - Total file size in bytes
   * @returns Promise resolving to the downloaded file path
   */
  async downloadToFile(
    sourceStream: Readable,
    infohash: string,
    fileIndex: number,
    fileName: string,
    totalBytes: number
  ): Promise<string> {
    const key = `${infohash}_${fileIndex}`;

    // Check if already downloading
    if (this.activeDownloads.has(key)) {
      const existing = this.activeDownloads.get(key)!;
      logger.info('File already downloading, returning existing path', {
        infohash,
        fileIndex,
        filePath: existing.filePath,
      });
      return existing.filePath;
    }

    // Check concurrent download limit
    if (this.activeDownloads.size >= this.maxConcurrentDownloads) {
      throw new Error(`Maximum concurrent downloads (${this.maxConcurrentDownloads}) reached`);
    }

    // Ensure temp directory exists
    await ensureTempDir();

    // Get file extension
    const ext = fileName.split('.').pop()?.toLowerCase() ?? 'mp4';
    const filePath = getTempFilePath(infohash, fileIndex, ext);

    logger.info('Starting file download', {
      infohash,
      fileIndex,
      fileName,
      filePath,
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
    });

    const abortController = new AbortController();
    const writeStream = createWriteStream(filePath);
    const downloadId = randomUUID();

    const download: ActiveDownload = {
      id: downloadId,
      infohash,
      fileIndex,
      filePath,
      bytesDownloaded: 0,
      totalBytes,
      writeStream,
      startedAt: new Date(),
      abortController,
    };

    this.activeDownloads.set(key, download);

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let lastLoggedMB = 0;

      const cleanup = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        this.activeDownloads.delete(key);
      };

      // Set download timeout
      timeoutId = setTimeout(() => {
        cleanup();
        sourceStream.destroy(new Error('Download timeout'));
        writeStream.destroy();
        reject(new Error(`Download timed out after ${this.downloadTimeout}ms`));
      }, this.downloadTimeout);

      // Track download progress
      sourceStream.on('data', (chunk: Buffer) => {
        download.bytesDownloaded += chunk.length;
        const downloadedMB = download.bytesDownloaded / (1024 * 1024);

        // Log progress every 10MB
        if (downloadedMB - lastLoggedMB >= 10) {
          logger.info('Download progress', {
            infohash,
            fileIndex,
            bytesDownloaded: download.bytesDownloaded,
            downloadedMB: downloadedMB.toFixed(2),
            totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
            progress: ((download.bytesDownloaded / totalBytes) * 100).toFixed(1) + '%',
          });
          lastLoggedMB = downloadedMB;
        }
      });

      // Pipe source to file
      sourceStream.pipe(writeStream);

      writeStream.on('finish', () => {
        cleanup();
        logger.info('Download complete', {
          infohash,
          fileIndex,
          filePath,
          bytesDownloaded: download.bytesDownloaded,
          downloadedMB: (download.bytesDownloaded / (1024 * 1024)).toFixed(2),
          elapsed: `${Date.now() - download.startedAt.getTime()}ms`,
        });
        resolve(filePath);
      });

      writeStream.on('error', (err) => {
        cleanup();
        logger.error('Download write error', err, { infohash, fileIndex, filePath });
        reject(err);
      });

      sourceStream.on('error', (err) => {
        cleanup();
        writeStream.destroy();
        logger.error('Download source error', err, { infohash, fileIndex });
        reject(err);
      });

      // Handle abort
      abortController.signal.addEventListener('abort', () => {
        cleanup();
        sourceStream.destroy();
        writeStream.destroy();
        reject(new Error('Download aborted'));
      });
    });
  }

  /**
   * Transcode a downloaded file
   *
   * @param filePath - Path to the downloaded file
   * @param infohash - The torrent infohash
   * @param fileIndex - The file index
   * @param cleanupOnComplete - Whether to delete the file after transcoding (default: true)
   * @returns Object with output stream and mime type
   */
  transcodeFile(
    filePath: string,
    infohash: string,
    fileIndex: number,
    cleanupOnComplete = true
  ): { stream: PassThrough; mimeType: string } {
    const key = `${infohash}_${fileIndex}`;
    const transcodeId = randomUUID();

    logger.info('Starting file transcoding', {
      infohash,
      fileIndex,
      filePath,
      cleanupOnComplete,
    });

    // Build FFmpeg args for file input (not pipe)
    // Since we have a file, FFmpeg can seek and read the moov atom
    // Limit to 2 threads to prevent CPU spikes with concurrent streams
    // -err_detect ignore_err: tolerate partial/growing files
    // -fflags +genpts+discardcorrupt: handle incomplete data gracefully
    const ffmpegArgs = [
      '-threads', '2',
      '-err_detect', 'ignore_err',
      '-fflags', '+genpts+discardcorrupt',
      '-i', filePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-acodec', 'aac',
      '-vcodec', 'libx264',
      // Scale to 720p max for quality, -2 ensures even dimensions
      '-vf', "scale=-2:'min(720,ceil(ih/2)*2)':flags=bilinear",
      '-preset', 'fast',
      '-tune', 'zerolatency',
      '-profile:v', 'main',
      '-level:v', '3.1',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-bf', '0',
      '-crf', '26',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-maxrate', '2.5M',
      '-bufsize', '5M',
      '-b:a', '128k',
      '-f', 'mp4',
      'pipe:1',
    ];

    logger.debug('FFmpeg args for file transcoding', {
      args: ffmpegArgs.join(' '),
    });

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const outputStream = new PassThrough();

    const transcode: ActiveTranscode = {
      id: transcodeId,
      infohash,
      fileIndex,
      filePath,
      ffmpegProcess: ffmpeg,
      outputStream,
      startedAt: new Date(),
    };

    this.activeTranscodes.set(key, transcode);

    // Track FFmpeg output
    let bytesOutput = 0;
    let lastLoggedOutputMB = 0;

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      bytesOutput += chunk.length;
      const outputMB = bytesOutput / (1024 * 1024);

      if (outputMB - lastLoggedOutputMB >= 5) {
        logger.info('Transcode output progress', {
          infohash,
          fileIndex,
          bytesOutput,
          outputMB: outputMB.toFixed(2),
        });
        lastLoggedOutputMB = outputMB;
      }
    });

    // Pipe FFmpeg output to PassThrough
    ffmpeg.stdout.pipe(outputStream);

    // Handle FFmpeg stderr (progress/errors)
    // Limit buffer size to prevent memory leaks during long transcoding sessions
    const MAX_STDERR_BUFFER = 10000; // 10KB max
    let stderrBuffer = '';
    ffmpeg.stderr.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      // Limit buffer size to prevent memory leaks
      if (stderrBuffer.length > MAX_STDERR_BUFFER) {
        stderrBuffer = stderrBuffer.slice(-MAX_STDERR_BUFFER);
      }
      // Log progress periodically
      if (stderrBuffer.includes('frame=') || stderrBuffer.includes('time=')) {
        const lines = stderrBuffer.split('\n');
        const lastLine = lines[lines.length - 2] || lines[lines.length - 1];
        if (lastLine.trim()) {
          logger.debug('FFmpeg progress', { progress: lastLine.trim() });
        }
        stderrBuffer = lines[lines.length - 1];
      }
    });

    // Handle FFmpeg close
    ffmpeg.on('close', (code) => {
      this.activeTranscodes.delete(key);

      if (code !== 0 && code !== null) {
        logger.warn('FFmpeg exited with non-zero code', {
          code,
          stderr: stderrBuffer.slice(-500),
          infohash,
          fileIndex,
        });
      } else {
        logger.info('FFmpeg transcoding completed', {
          infohash,
          fileIndex,
          bytesOutput,
          outputMB: (bytesOutput / (1024 * 1024)).toFixed(2),
          elapsed: `${Date.now() - transcode.startedAt.getTime()}ms`,
        });
      }

      // Cleanup temp file if requested
      if (cleanupOnComplete) {
        cleanupTempFile(filePath).catch((err) => {
          logger.warn('Failed to cleanup temp file after transcode', {
            filePath,
            error: String(err),
          });
        });
      }
    });

    // Handle FFmpeg errors
    ffmpeg.on('error', (err) => {
      this.activeTranscodes.delete(key);
      logger.error('FFmpeg process error', err, { infohash, fileIndex });
      outputStream.destroy(err);

      if (cleanupOnComplete) {
        cleanupTempFile(filePath).catch(() => {});
      }
    });

    // Handle output stream close (client disconnected)
    outputStream.on('close', () => {
      logger.debug('Output stream closed, killing FFmpeg', { infohash, fileIndex });
      ffmpeg.kill('SIGTERM');
    });

    return {
      stream: outputStream,
      mimeType: 'video/mp4',
    };
  }

  /**
   * Download and transcode a file in one operation (Option C: stream-as-available)
   *
   * Instead of waiting for the full download, starts FFmpeg transcoding once
   * enough data has been written to disk (minBytesBeforeTranscode or 10% of file).
   * FFmpeg reads from the growing file while the torrent continues downloading.
   *
   * @param sourceStream - The source stream from WebTorrent
   * @param infohash - The torrent infohash
   * @param fileIndex - The file index in the torrent
   * @param fileName - The original file name
   * @param totalBytes - Total file size in bytes
   * @returns Promise resolving to transcoded stream and mime type
   */
  async downloadAndTranscode(
    sourceStream: Readable,
    infohash: string,
    fileIndex: number,
    fileName: string,
    totalBytes: number
  ): Promise<{ stream: PassThrough; mimeType: string }> {
    const startThreshold = Math.min(
      this.minBytesBeforeTranscode,
      Math.floor(totalBytes * 0.1)
    );

    logger.info('Starting download and transcode (stream-as-available)', {
      infohash,
      fileIndex,
      fileName,
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      startThresholdMB: (startThreshold / (1024 * 1024)).toFixed(2),
    });

    const key = `${infohash}_${fileIndex}`;

    // Check concurrent download limit
    if (this.activeDownloads.size >= this.maxConcurrentDownloads) {
      throw new Error(`Maximum concurrent downloads (${this.maxConcurrentDownloads}) reached`);
    }

    // Ensure temp directory exists
    await ensureTempDir();

    const ext = fileName.split('.').pop()?.toLowerCase() ?? 'mp4';
    const filePath = getTempFilePath(infohash, fileIndex, ext);
    const abortController = new AbortController();
    const writeStream = createWriteStream(filePath);
    const downloadId = randomUUID();

    const download: ActiveDownload = {
      id: downloadId,
      infohash,
      fileIndex,
      filePath,
      bytesDownloaded: 0,
      totalBytes,
      writeStream,
      startedAt: new Date(),
      abortController,
    };

    this.activeDownloads.set(key, download);

    // Return a promise that resolves once we have enough data to start transcoding
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let lastLoggedMB = 0;
      let transcodeStarted = false;
      let downloadComplete = false;

      const cleanup = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        this.activeDownloads.delete(key);
      };

      // Set download timeout (only for the initial data threshold, not the full file)
      timeoutId = setTimeout(() => {
        if (!transcodeStarted) {
          cleanup();
          sourceStream.destroy(new Error('Download timeout waiting for initial data'));
          writeStream.destroy();
          reject(new Error(`Timed out waiting for ${(startThreshold / (1024 * 1024)).toFixed(0)}MB of data after ${this.downloadTimeout}ms`));
        }
      }, this.downloadTimeout);

      const maybeStartTranscode = (): void => {
        if (transcodeStarted) return;
        if (download.bytesDownloaded < startThreshold && !downloadComplete) return;

        transcodeStarted = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        logger.info('Threshold reached, starting transcode on partial file', {
          infohash,
          fileIndex,
          bytesDownloaded: download.bytesDownloaded,
          downloadedMB: (download.bytesDownloaded / (1024 * 1024)).toFixed(2),
          totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
          downloadComplete,
        });

        // Start transcoding from the file — FFmpeg will read what's available
        // and block/retry on EOF until the file grows or download finishes
        const result = this.transcodeFile(filePath, infohash, fileIndex, true);
        resolve(result);
      };

      // Track download progress
      sourceStream.on('data', (chunk: Buffer) => {
        download.bytesDownloaded += chunk.length;
        const downloadedMB = download.bytesDownloaded / (1024 * 1024);

        if (downloadedMB - lastLoggedMB >= 10) {
          logger.info('Download progress', {
            infohash,
            fileIndex,
            downloadedMB: downloadedMB.toFixed(2),
            totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
            progress: ((download.bytesDownloaded / totalBytes) * 100).toFixed(1) + '%',
          });
          lastLoggedMB = downloadedMB;
        }
      });

      // Pipe source to file
      sourceStream.pipe(writeStream);

      // Use writeStream 'drain' events to check threshold (data is flushed to disk)
      writeStream.on('drain', () => {
        maybeStartTranscode();
      });

      // Also check on each data event in case writes don't trigger drain
      sourceStream.on('data', () => {
        maybeStartTranscode();
      });

      writeStream.on('finish', () => {
        downloadComplete = true;
        cleanup();
        logger.info('Download complete', {
          infohash,
          fileIndex,
          filePath,
          bytesDownloaded: download.bytesDownloaded,
          downloadedMB: (download.bytesDownloaded / (1024 * 1024)).toFixed(2),
          elapsed: `${Date.now() - download.startedAt.getTime()}ms`,
        });
        // If we haven't started transcoding yet (very small file), start now
        maybeStartTranscode();
      });

      writeStream.on('error', (err) => {
        cleanup();
        logger.error('Download write error', err, { infohash, fileIndex, filePath });
        if (!transcodeStarted) reject(err);
      });

      sourceStream.on('error', (err) => {
        cleanup();
        writeStream.destroy();
        logger.error('Download source error', err, { infohash, fileIndex });
        if (!transcodeStarted) reject(err);
      });

      abortController.signal.addEventListener('abort', () => {
        cleanup();
        sourceStream.destroy();
        writeStream.destroy();
        if (!transcodeStarted) reject(new Error('Download aborted'));
      });
    });
  }

  /**
   * Transcode only audio in a file (copy video stream, re-encode audio to AAC).
   * This is very fast since no video re-encoding is done — essentially a remux with audio transcode.
   * Used for MP4/MOV files with incompatible audio codecs (E-AC3, DTS, TrueHD, etc.)
   */
  transcodeFileAudioOnly(
    filePath: string,
    infohash: string,
    fileIndex: number,
    cleanupOnComplete = true
  ): { stream: PassThrough; mimeType: string } {
    const key = `${infohash}_${fileIndex}_audioremux`;
    const transcodeId = randomUUID();

    logger.info('Starting audio-only remux', {
      infohash,
      fileIndex,
      filePath,
    });

    // Audio-only remux: copy video, transcode audio to AAC
    const ffmpegArgs = [
      '-threads', '2',
      '-err_detect', 'ignore_err',
      '-fflags', '+genpts+discardcorrupt',
      '-i', filePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'copy',           // Copy video stream as-is (no re-encoding)
      '-c:a', 'aac',            // Transcode audio to AAC
      '-b:a', '192k',           // Audio bitrate
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    ];

    logger.debug('FFmpeg args for audio-only remux', {
      args: ffmpegArgs.join(' '),
    });

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const outputStream = new PassThrough();

    const transcode: ActiveTranscode = {
      id: transcodeId,
      infohash,
      fileIndex,
      filePath,
      ffmpegProcess: ffmpeg,
      outputStream,
      startedAt: new Date(),
    };

    this.activeTranscodes.set(key, transcode);

    let bytesOutput = 0;
    let lastLoggedOutputMB = 0;

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      bytesOutput += chunk.length;
      const outputMB = bytesOutput / (1024 * 1024);
      if (outputMB - lastLoggedOutputMB >= 5) {
        logger.info('Audio remux output progress', {
          infohash, fileIndex, outputMB: outputMB.toFixed(2),
        });
        lastLoggedOutputMB = outputMB;
      }
    });

    ffmpeg.stdout.pipe(outputStream);

    const MAX_STDERR_BUFFER = 10000;
    let stderrBuffer = '';
    ffmpeg.stderr.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      if (stderrBuffer.length > MAX_STDERR_BUFFER) {
        stderrBuffer = stderrBuffer.slice(-MAX_STDERR_BUFFER);
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error('Audio remux FFmpeg error', err, { infohash, fileIndex });
      this.activeTranscodes.delete(key);
      outputStream.destroy(err);
    });

    ffmpeg.on('close', (code) => {
      this.activeTranscodes.delete(key);
      if (code !== 0 && code !== null) {
        logger.warn('Audio remux FFmpeg exited with non-zero code', { code, stderr: stderrBuffer.slice(-500) });
      } else {
        logger.info('Audio remux completed', { infohash, fileIndex, bytesOutput });
      }
      if (cleanupOnComplete) {
        cleanupTempFile(filePath).catch((err) => {
          logger.warn('Failed to cleanup temp file after audio remux', { error: String(err), filePath });
        });
      }
    });

    outputStream.on('close', () => {
      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGTERM');
      }
    });

    return { stream: outputStream, mimeType: 'video/mp4' };
  }

  /**
   * Download a file and then remux with audio-only transcoding (copy video, transcode audio to AAC).
   * Similar to downloadAndTranscode but uses audio-only remux which is much faster.
   * No size limit since video is just copied.
   */
  async downloadAndTranscodeAudioOnly(
    sourceStream: Readable,
    infohash: string,
    fileIndex: number,
    fileName: string,
    totalBytes: number
  ): Promise<{ stream: PassThrough; mimeType: string }> {
    const startThreshold = Math.min(
      this.minBytesBeforeTranscode,
      Math.floor(totalBytes * 0.1)
    );

    logger.info('Starting download for audio-only remux', {
      infohash, fileIndex, fileName,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      startThresholdMB: (startThreshold / (1024 * 1024)).toFixed(2),
    });

    const key = `${infohash}_${fileIndex}`;

    if (this.activeDownloads.size >= this.maxConcurrentDownloads) {
      throw new Error(`Maximum concurrent downloads (${this.maxConcurrentDownloads}) reached`);
    }

    await ensureTempDir();

    const ext = fileName.split('.').pop()?.toLowerCase() ?? 'mp4';
    const filePath = getTempFilePath(infohash, fileIndex, ext);
    const abortController = new AbortController();
    const writeStream = createWriteStream(filePath);
    const downloadId = randomUUID();

    const download: ActiveDownload = {
      id: downloadId,
      infohash,
      fileIndex,
      filePath,
      bytesDownloaded: 0,
      totalBytes,
      writeStream,
      startedAt: new Date(),
      abortController,
    };

    this.activeDownloads.set(key, download);

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let lastLoggedMB = 0;
      let transcodeStarted = false;
      let downloadComplete = false;

      const cleanup = (): void => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        this.activeDownloads.delete(key);
      };

      timeoutId = setTimeout(() => {
        if (!transcodeStarted) {
          cleanup();
          sourceStream.destroy(new Error('Download timeout waiting for initial data'));
          writeStream.destroy();
          reject(new Error(`Timed out waiting for data after ${this.downloadTimeout}ms`));
        }
      }, this.downloadTimeout);

      const maybeStartTranscode = (): void => {
        if (transcodeStarted) return;
        if (download.bytesDownloaded < startThreshold && !downloadComplete) return;

        transcodeStarted = true;
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

        logger.info('Threshold reached, starting audio-only remux', {
          infohash, fileIndex,
          downloadedMB: (download.bytesDownloaded / (1024 * 1024)).toFixed(2),
          downloadComplete,
        });

        const result = this.transcodeFileAudioOnly(filePath, infohash, fileIndex, true);
        resolve(result);
      };

      sourceStream.on('data', (chunk: Buffer) => {
        download.bytesDownloaded += chunk.length;
        const downloadedMB = download.bytesDownloaded / (1024 * 1024);
        if (downloadedMB - lastLoggedMB >= 10) {
          logger.info('Audio remux download progress', {
            infohash, fileIndex,
            downloadedMB: downloadedMB.toFixed(2),
            totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
            progress: ((download.bytesDownloaded / totalBytes) * 100).toFixed(1) + '%',
          });
          lastLoggedMB = downloadedMB;
        }
      });

      sourceStream.pipe(writeStream);

      writeStream.on('drain', () => { maybeStartTranscode(); });
      sourceStream.on('data', () => { maybeStartTranscode(); });

      writeStream.on('finish', () => {
        downloadComplete = true;
        cleanup();
        logger.info('Audio remux download complete', {
          infohash, fileIndex, filePath,
          downloadedMB: (download.bytesDownloaded / (1024 * 1024)).toFixed(2),
          elapsed: `${Date.now() - download.startedAt.getTime()}ms`,
        });
        maybeStartTranscode();
      });

      writeStream.on('error', (err) => {
        cleanup();
        logger.error('Audio remux download write error', err, { infohash, fileIndex });
        if (!transcodeStarted) reject(err);
      });

      sourceStream.on('error', (err) => {
        cleanup();
        writeStream.destroy();
        logger.error('Audio remux download source error', err, { infohash, fileIndex });
        if (!transcodeStarted) reject(err);
      });

      abortController.signal.addEventListener('abort', () => {
        cleanup();
        sourceStream.destroy();
        writeStream.destroy();
        if (!transcodeStarted) reject(new Error('Download aborted'));
      });
    });
  }

  /**
   * Abort a download in progress
   */
  abortDownload(infohash: string, fileIndex: number): boolean {
    const key = `${infohash}_${fileIndex}`;
    const download = this.activeDownloads.get(key);
    if (download) {
      download.abortController.abort();
      return true;
    }
    return false;
  }

  /**
   * Abort a transcode in progress
   */
  abortTranscode(infohash: string, fileIndex: number): boolean {
    const key = `${infohash}_${fileIndex}`;
    const transcode = this.activeTranscodes.get(key);
    if (transcode) {
      transcode.ffmpegProcess.kill('SIGTERM');
      return true;
    }
    return false;
  }

  /**
   * Destroy the service and clean up all resources
   */
  async destroy(): Promise<void> {
    logger.info('Destroying FileTranscodingService', {
      activeDownloads: this.activeDownloads.size,
      activeTranscodes: this.activeTranscodes.size,
    });

    // Stop periodic cleanup
    this.stopPeriodicCleanup();

    // Abort all downloads
    for (const [, download] of this.activeDownloads) {
      download.abortController.abort();
      await cleanupTempFile(download.filePath);
    }
    this.activeDownloads.clear();

    // Kill all transcodes
    for (const [, transcode] of this.activeTranscodes) {
      transcode.ffmpegProcess.kill('SIGTERM');
      await cleanupTempFile(transcode.filePath);
    }
    this.activeTranscodes.clear();
  }
}

// Singleton instance
let fileTranscodingServiceInstance: FileTranscodingService | null = null;

/**
 * Get the singleton FileTranscodingService instance
 */
export function getFileTranscodingService(): FileTranscodingService {
  if (!fileTranscodingServiceInstance) {
    fileTranscodingServiceInstance = new FileTranscodingService();
  }
  return fileTranscodingServiceInstance;
}
