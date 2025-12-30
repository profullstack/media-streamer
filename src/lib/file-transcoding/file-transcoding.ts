/**
 * File-based Transcoding Service
 *
 * Handles transcoding for MP4/MOV files that cannot be transcoded via pipe
 * because the moov atom (metadata) is at the end of the file.
 *
 * Strategy:
 * 1. Download the file to /tmp/{infohash}_{fileIndex}.{ext}
 * 2. Once the file is complete (or has enough data), start FFmpeg transcoding from the file
 * 3. Stream the transcoded output back to the client
 * 4. Clean up temp files after streaming completes
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough, type Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger';

const logger = createLogger('FileTranscoding');

/**
 * Temp directory for downloaded files
 */
export const TEMP_DIR = join(tmpdir(), 'media-torrent-transcoding');

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
  await mkdir(TEMP_DIR, { recursive: true });
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

  constructor(options: FileTranscodingServiceOptions = {}) {
    this.maxConcurrentDownloads = options.maxConcurrentDownloads ?? 3;
    this.downloadTimeout = options.downloadTimeout ?? 300000; // 5 minutes
    this.minBytesBeforeTranscode = options.minBytesBeforeTranscode ?? 50 * 1024 * 1024; // 50MB
    this.activeDownloads = new Map();
    this.activeTranscodes = new Map();

    logger.info('FileTranscodingService initialized', {
      maxConcurrentDownloads: this.maxConcurrentDownloads,
      downloadTimeout: this.downloadTimeout,
      minBytesBeforeTranscode: this.minBytesBeforeTranscode,
      tempDir: TEMP_DIR,
    });
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
    const ffmpegArgs = [
      '-threads', '0',
      '-i', filePath,
      '-acodec', 'aac',
      '-vcodec', 'libx264',
      '-vf', "scale=-2:'min(480,ceil(ih/2)*2)':flags=fast_bilinear",
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-level:v', '3.0',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-bf', '0',
      '-crf', '30',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-maxrate', '1M',
      '-bufsize', '2M',
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
    let stderrBuffer = '';
    ffmpeg.stderr.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
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
   * Download and transcode a file in one operation
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
    logger.info('Starting download and transcode', {
      infohash,
      fileIndex,
      fileName,
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
    });

    // Download the file first
    const filePath = await this.downloadToFile(
      sourceStream,
      infohash,
      fileIndex,
      fileName,
      totalBytes
    );

    // Then transcode it
    return this.transcodeFile(filePath, infohash, fileIndex, true);
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

    // Abort all downloads
    for (const [key, download] of this.activeDownloads) {
      download.abortController.abort();
      await cleanupTempFile(download.filePath);
    }
    this.activeDownloads.clear();

    // Kill all transcodes
    for (const [key, transcode] of this.activeTranscodes) {
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
