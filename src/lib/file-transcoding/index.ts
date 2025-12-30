/**
 * File-based Transcoding Module
 *
 * Exports for handling MP4/MOV file transcoding that requires
 * file-based access due to the moov atom being at the end.
 */

export {
  FileTranscodingService,
  getFileTranscodingService,
  getTempFilePath,
  cleanupTempFile,
  isFileBasedTranscodingRequired,
  TEMP_DIR,
  type FileTranscodingServiceOptions,
  type DownloadProgress,
} from './file-transcoding';
