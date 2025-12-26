import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and tailwind-merge
 * This ensures Tailwind classes are properly merged without conflicts
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to human readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Determine media category from file extension
 */
export type MediaCategory = 'audio' | 'video' | 'ebook' | 'document' | 'other';

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a', 'wma', 'opus'];
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'webm', 'mov', 'wmv', 'flv', 'm4v'];
const EBOOK_EXTENSIONS = ['pdf', 'epub', 'mobi', 'azw', 'azw3'];
const DOCUMENT_EXTENSIONS = ['txt', 'md', 'doc', 'docx', 'rtf'];

export function getMediaCategory(filename: string): MediaCategory {
  const ext = getFileExtension(filename);
  
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (EBOOK_EXTENSIONS.includes(ext)) return 'ebook';
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  return 'other';
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  
  const mimeTypes: Record<string, string> = {
    // Audio
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    opus: 'audio/opus',
    
    // Video
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mov: 'video/quicktime',
    
    // Ebooks
    pdf: 'application/pdf',
    epub: 'application/epub+zip',
    
    // Documents
    txt: 'text/plain',
    md: 'text/markdown',
  };
  
  return mimeTypes[ext] ?? 'application/octet-stream';
}
