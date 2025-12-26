import { describe, it, expect } from 'vitest';
import {
  cn,
  formatBytes,
  formatDuration,
  truncate,
  getFileExtension,
  getMediaCategory,
  getMimeType,
} from './utils';

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('should merge tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('should handle undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });
});

describe('formatBytes', () => {
  it('should return "0 Bytes" for 0', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should format bytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('should respect decimal places', () => {
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
    expect(formatBytes(1536, 0)).toBe('2 KB');
  });

  it('should handle large values', () => {
    expect(formatBytes(1099511627776)).toBe('1 TB');
  });
});

describe('formatDuration', () => {
  it('should format seconds only', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('should pad seconds correctly', () => {
    expect(formatDuration(65)).toBe('1:05');
  });
});

describe('truncate', () => {
  it('should not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate long strings with ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('should handle exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('getFileExtension', () => {
  it('should extract extension from filename', () => {
    expect(getFileExtension('song.mp3')).toBe('mp3');
    expect(getFileExtension('movie.mkv')).toBe('mkv');
  });

  it('should handle multiple dots', () => {
    expect(getFileExtension('file.name.txt')).toBe('txt');
  });

  it('should return empty string for no extension', () => {
    expect(getFileExtension('filename')).toBe('');
  });

  it('should return lowercase extension', () => {
    expect(getFileExtension('file.MP3')).toBe('mp3');
  });
});

describe('getMediaCategory', () => {
  it('should identify audio files', () => {
    expect(getMediaCategory('song.mp3')).toBe('audio');
    expect(getMediaCategory('track.flac')).toBe('audio');
    expect(getMediaCategory('audio.ogg')).toBe('audio');
    expect(getMediaCategory('sound.wav')).toBe('audio');
  });

  it('should identify video files', () => {
    expect(getMediaCategory('movie.mp4')).toBe('video');
    expect(getMediaCategory('film.mkv')).toBe('video');
    expect(getMediaCategory('clip.avi')).toBe('video');
    expect(getMediaCategory('video.webm')).toBe('video');
  });

  it('should identify ebook files', () => {
    expect(getMediaCategory('book.pdf')).toBe('ebook');
    expect(getMediaCategory('novel.epub')).toBe('ebook');
    expect(getMediaCategory('ebook.mobi')).toBe('ebook');
  });

  it('should identify document files', () => {
    expect(getMediaCategory('readme.txt')).toBe('document');
    expect(getMediaCategory('notes.md')).toBe('document');
  });

  it('should return other for unknown extensions', () => {
    expect(getMediaCategory('file.xyz')).toBe('other');
    expect(getMediaCategory('noextension')).toBe('other');
  });
});

describe('getMimeType', () => {
  it('should return correct MIME type for audio', () => {
    expect(getMimeType('song.mp3')).toBe('audio/mpeg');
    expect(getMimeType('track.flac')).toBe('audio/flac');
    expect(getMimeType('audio.ogg')).toBe('audio/ogg');
  });

  it('should return correct MIME type for video', () => {
    expect(getMimeType('movie.mp4')).toBe('video/mp4');
    expect(getMimeType('film.mkv')).toBe('video/x-matroska');
    expect(getMimeType('clip.webm')).toBe('video/webm');
  });

  it('should return correct MIME type for ebooks', () => {
    expect(getMimeType('book.pdf')).toBe('application/pdf');
    expect(getMimeType('novel.epub')).toBe('application/epub+zip');
  });

  it('should return octet-stream for unknown types', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
  });
});
