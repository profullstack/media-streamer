/**
 * FileTree Component Tests
 *
 * Tests for the FileTree helper functions that collect and count audio files.
 */

import { describe, it, expect } from 'vitest';

// Re-create the types and functions for testing since they're not exported
interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, FileTreeNode>;
  file?: {
    name: string;
    path: string;
    size: number;
    fileIndex: number;
    mediaCategory: 'audio' | 'video' | 'ebook' | 'document' | 'other';
  };
}

/**
 * Collect all audio files from a tree node (recursively)
 */
function collectAudioFiles(node: FileTreeNode): FileTreeNode['file'][] {
  const audioFiles: FileTreeNode['file'][] = [];

  if (node.file && node.file.mediaCategory === 'audio') {
    audioFiles.push(node.file);
  }

  for (const child of node.children.values()) {
    audioFiles.push(...collectAudioFiles(child));
  }

  // Sort by path for consistent ordering
  return audioFiles.sort((a, b) => {
    if (!a || !b) return 0;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Count audio files in a tree node (recursively)
 */
function countAudioFiles(node: FileTreeNode): number {
  let count = 0;

  if (node.file && node.file.mediaCategory === 'audio') {
    count++;
  }

  for (const child of node.children.values()) {
    count += countAudioFiles(child);
  }

  return count;
}

/**
 * Build a tree structure from flat file list
 */
function buildFileTree(
  files: Array<{
    name: string;
    path: string;
    size: number;
    fileIndex: number;
    mediaCategory: 'audio' | 'video' | 'ebook' | 'document' | 'other';
  }>
): FileTreeNode {
  const root: FileTreeNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          children: new Map(),
          file: isLast ? file : undefined,
        });
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

describe('FileTree Helper Functions', () => {
  describe('buildFileTree', () => {
    it('should build a tree from flat file list', () => {
      const files = [
        { name: 'track1.mp3', path: 'Album/track1.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'track2.mp3', path: 'Album/track2.mp3', size: 1000, fileIndex: 1, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);

      expect(tree.isDirectory).toBe(true);
      expect(tree.children.size).toBe(1);
      expect(tree.children.has('Album')).toBe(true);

      const albumNode = tree.children.get('Album')!;
      expect(albumNode.isDirectory).toBe(true);
      expect(albumNode.children.size).toBe(2);
    });

    it('should handle nested directories', () => {
      const files = [
        { name: 'track1.mp3', path: 'Artist/Album1/track1.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'track2.mp3', path: 'Artist/Album2/track2.mp3', size: 1000, fileIndex: 1, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);

      const artistNode = tree.children.get('Artist')!;
      expect(artistNode.isDirectory).toBe(true);
      expect(artistNode.children.size).toBe(2);
      expect(artistNode.children.has('Album1')).toBe(true);
      expect(artistNode.children.has('Album2')).toBe(true);
    });

    it('should handle single file at root', () => {
      const files = [
        { name: 'track.mp3', path: 'track.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);

      expect(tree.children.size).toBe(1);
      const fileNode = tree.children.get('track.mp3')!;
      expect(fileNode.isDirectory).toBe(false);
      expect(fileNode.file?.name).toBe('track.mp3');
    });
  });

  describe('collectAudioFiles', () => {
    it('should collect all audio files from a directory', () => {
      const files = [
        { name: 'track1.mp3', path: 'Album/track1.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'track2.mp3', path: 'Album/track2.mp3', size: 1000, fileIndex: 1, mediaCategory: 'audio' as const },
        { name: 'cover.jpg', path: 'Album/cover.jpg', size: 500, fileIndex: 2, mediaCategory: 'other' as const },
      ];

      const tree = buildFileTree(files);
      const albumNode = tree.children.get('Album')!;
      const audioFiles = collectAudioFiles(albumNode);

      expect(audioFiles.length).toBe(2);
      expect(audioFiles[0]?.name).toBe('track1.mp3');
      expect(audioFiles[1]?.name).toBe('track2.mp3');
    });

    it('should collect audio files from nested directories', () => {
      const files = [
        { name: 'track1.mp3', path: 'Artist/Album1/track1.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'track2.mp3', path: 'Artist/Album2/track2.mp3', size: 1000, fileIndex: 1, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);
      const artistNode = tree.children.get('Artist')!;
      const audioFiles = collectAudioFiles(artistNode);

      expect(audioFiles.length).toBe(2);
    });

    it('should return empty array for directory with no audio files', () => {
      const files = [
        { name: 'cover.jpg', path: 'Album/cover.jpg', size: 500, fileIndex: 0, mediaCategory: 'other' as const },
        { name: 'readme.txt', path: 'Album/readme.txt', size: 100, fileIndex: 1, mediaCategory: 'document' as const },
      ];

      const tree = buildFileTree(files);
      const albumNode = tree.children.get('Album')!;
      const audioFiles = collectAudioFiles(albumNode);

      expect(audioFiles.length).toBe(0);
    });

    it('should sort audio files by path', () => {
      const files = [
        { name: 'track3.mp3', path: 'Album/track3.mp3', size: 1000, fileIndex: 2, mediaCategory: 'audio' as const },
        { name: 'track1.mp3', path: 'Album/track1.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'track2.mp3', path: 'Album/track2.mp3', size: 1000, fileIndex: 1, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);
      const albumNode = tree.children.get('Album')!;
      const audioFiles = collectAudioFiles(albumNode);

      expect(audioFiles[0]?.path).toBe('Album/track1.mp3');
      expect(audioFiles[1]?.path).toBe('Album/track2.mp3');
      expect(audioFiles[2]?.path).toBe('Album/track3.mp3');
    });
  });

  describe('countAudioFiles', () => {
    it('should count audio files in a directory', () => {
      const files = [
        { name: 'track1.mp3', path: 'Album/track1.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'track2.mp3', path: 'Album/track2.mp3', size: 1000, fileIndex: 1, mediaCategory: 'audio' as const },
        { name: 'cover.jpg', path: 'Album/cover.jpg', size: 500, fileIndex: 2, mediaCategory: 'other' as const },
      ];

      const tree = buildFileTree(files);
      const albumNode = tree.children.get('Album')!;
      const count = countAudioFiles(albumNode);

      expect(count).toBe(2);
    });

    it('should count audio files in nested directories', () => {
      const files = [
        { name: 'track1.mp3', path: 'Artist/Album1/track1.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'track2.mp3', path: 'Artist/Album1/track2.mp3', size: 1000, fileIndex: 1, mediaCategory: 'audio' as const },
        { name: 'track3.mp3', path: 'Artist/Album2/track3.mp3', size: 1000, fileIndex: 2, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);
      const artistNode = tree.children.get('Artist')!;
      const count = countAudioFiles(artistNode);

      expect(count).toBe(3);
    });

    it('should return 0 for directory with no audio files', () => {
      const files = [
        { name: 'cover.jpg', path: 'Album/cover.jpg', size: 500, fileIndex: 0, mediaCategory: 'other' as const },
      ];

      const tree = buildFileTree(files);
      const albumNode = tree.children.get('Album')!;
      const count = countAudioFiles(albumNode);

      expect(count).toBe(0);
    });

    it('should count single audio file', () => {
      const files = [
        { name: 'track.mp3', path: 'track.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);
      const fileNode = tree.children.get('track.mp3')!;
      const count = countAudioFiles(fileNode);

      expect(count).toBe(1);
    });
  });

  describe('Mixed media types', () => {
    it('should only collect audio files, ignoring video and ebook', () => {
      const files = [
        { name: 'track.mp3', path: 'Media/track.mp3', size: 1000, fileIndex: 0, mediaCategory: 'audio' as const },
        { name: 'movie.mkv', path: 'Media/movie.mkv', size: 5000, fileIndex: 1, mediaCategory: 'video' as const },
        { name: 'book.epub', path: 'Media/book.epub', size: 2000, fileIndex: 2, mediaCategory: 'ebook' as const },
        { name: 'track2.flac', path: 'Media/track2.flac', size: 3000, fileIndex: 3, mediaCategory: 'audio' as const },
      ];

      const tree = buildFileTree(files);
      const mediaNode = tree.children.get('Media')!;
      const audioFiles = collectAudioFiles(mediaNode);
      const count = countAudioFiles(mediaNode);

      expect(audioFiles.length).toBe(2);
      expect(count).toBe(2);
      expect(audioFiles.every((f) => f?.mediaCategory === 'audio')).toBe(true);
    });
  });
});
