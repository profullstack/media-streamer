'use client';

/**
 * File Tree Component
 * 
 * Displays a hierarchical tree view of files within a torrent.
 * Supports expand/collapse, file type icons, and click actions.
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  MusicIcon,
  VideoIcon,
  BookIcon,
  PlayIcon,
  DownloadIcon,
} from '@/components/ui/icons';
import type { TorrentFile, MediaCategory } from '@/types';
import { formatBytes } from '@/lib/utils';

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, FileTreeNode>;
  file?: TorrentFile;
}

interface FileTreeProps {
  files: TorrentFile[];
  onFileSelect?: (file: TorrentFile) => void;
  onFilePlay?: (file: TorrentFile) => void;
  onFileDownload?: (file: TorrentFile) => void;
  /** Callback when "Play All" is clicked for a folder or the entire collection */
  onPlayAll?: (files: TorrentFile[]) => void;
  className?: string;
}

/**
 * Build a tree structure from flat file list
 */
function buildFileTree(files: TorrentFile[]): FileTreeNode {
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

/**
 * Collect all audio files from a tree node (recursively)
 */
function collectAudioFiles(node: FileTreeNode): TorrentFile[] {
  const audioFiles: TorrentFile[] = [];
  
  if (node.file && node.file.mediaCategory === 'audio') {
    audioFiles.push(node.file);
  }
  
  for (const child of node.children.values()) {
    audioFiles.push(...collectAudioFiles(child));
  }
  
  // Sort by path for consistent ordering
  return audioFiles.sort((a, b) => a.path.localeCompare(b.path));
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
 * Get icon for media category
 */
function getMediaIcon(category: MediaCategory): React.ComponentType<{ className?: string; size?: number }> {
  switch (category) {
    case 'audio':
      return MusicIcon;
    case 'video':
      return VideoIcon;
    case 'ebook':
      return BookIcon;
    default:
      return FileIcon;
  }
}

/**
 * Get color class for media category
 */
function getMediaColor(category: MediaCategory): string {
  switch (category) {
    case 'audio':
      return 'text-accent-audio';
    case 'video':
      return 'text-accent-video';
    case 'ebook':
      return 'text-accent-ebook';
    default:
      return 'text-text-secondary';
  }
}

export function FileTree({
  files,
  onFileSelect,
  onFilePlay,
  onFileDownload,
  onPlayAll,
  className,
}: FileTreeProps): React.ReactElement {
  const tree = useMemo(() => buildFileTree(files), [files]);

  return (
    <div className={cn('text-sm overflow-hidden', className)}>
      {Array.from(tree.children.values()).map((node) => (
        <FileTreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          onFileSelect={onFileSelect}
          onFilePlay={onFilePlay}
          onFileDownload={onFileDownload}
          onPlayAll={onPlayAll}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  depth: number;
  onFileSelect?: (file: TorrentFile) => void;
  onFilePlay?: (file: TorrentFile) => void;
  onFileDownload?: (file: TorrentFile) => void;
  onPlayAll?: (files: TorrentFile[]) => void;
}

function FileTreeNodeComponent({
  node,
  depth,
  onFileSelect,
  onFilePlay,
  onFileDownload,
  onPlayAll,
}: FileTreeNodeComponentProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  // Count audio files in this directory for "Play All" button
  const audioFileCount = useMemo(() => {
    if (!node.isDirectory) return 0;
    return countAudioFiles(node);
  }, [node]);

  const handleToggle = (): void => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleClick = (): void => {
    if (!node.isDirectory && node.file && onFileSelect) {
      onFileSelect(node.file);
    }
  };

  const handlePlay = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (node.file && onFilePlay) {
      onFilePlay(node.file);
    }
  };

  const handleDownload = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (node.file && onFileDownload) {
      onFileDownload(node.file);
    }
  };

  const handlePlayAll = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onPlayAll && node.isDirectory) {
      const audioFiles = collectAudioFiles(node);
      if (audioFiles.length > 0) {
        onPlayAll(audioFiles);
      }
    }
  };

  const sortedChildren = useMemo(() => {
    const children = Array.from(node.children.values());
    // Sort directories first, then by name
    return children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  const Icon = node.isDirectory
    ? isExpanded
      ? FolderOpenIcon
      : FolderIcon
    : node.file
      ? getMediaIcon(node.file.mediaCategory)
      : FileIcon;

  const iconColor = node.isDirectory
    ? 'text-accent-primary'
    : node.file
      ? getMediaColor(node.file.mediaCategory)
      : 'text-text-secondary';

  const isPlayable = node.file && (node.file.mediaCategory === 'audio' || node.file.mediaCategory === 'video');

  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
          'hover:bg-bg-hover cursor-pointer',
          !node.isDirectory && 'hover:bg-bg-tertiary'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={node.isDirectory ? handleToggle : handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (node.isDirectory) {
              handleToggle();
            } else {
              handleClick();
            }
          }
        }}
      >
        {/* Expand/collapse arrow for directories */}
        {node.isDirectory ? (
          <span className="flex h-5 w-5 items-center justify-center text-text-muted flex-shrink-0">
            {isExpanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
          </span>
        ) : (
          /* Action buttons for files - LEFT of filename, always visible */
          <div className="flex items-center gap-1 flex-shrink-0">
            {isPlayable && onFilePlay ? <button
                type="button"
                onClick={handlePlay}
                className="rounded-lg p-2 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/30 active:bg-accent-primary/40 transition-colors"
                title="Play"
                aria-label={`Play ${node.name}`}
              >
                <PlayIcon size={20} />
              </button> : null}
            {onFileDownload ? <button
                type="button"
                onClick={handleDownload}
                className="rounded-lg p-2 bg-accent-secondary/10 text-accent-secondary hover:bg-accent-secondary/30 active:bg-accent-secondary/40 transition-colors"
                title="Download"
                aria-label={`Download ${node.name}`}
              >
                <DownloadIcon size={20} />
              </button> : null}
            {/* Spacer if no buttons */}
            {!isPlayable && !onFilePlay && !onFileDownload && <span className="w-5" />}
          </div>
        )}

        {/* Icon */}
        <Icon className={cn(iconColor, 'flex-shrink-0')} size={18} />

        {/* Name - min-w-0 is required for truncate to work in flex container */}
        <span className="flex-1 min-w-0 truncate text-text-primary">{node.name}</span>

        {/* File size */}
        {node.file ? <span className="text-xs text-text-muted flex-shrink-0 ml-2">{formatBytes(node.file.size)}</span> : null}

        {/* Play All button for directories with audio files */}
        {node.isDirectory && audioFileCount > 0 && onPlayAll ? (
          <button
            type="button"
            onClick={handlePlayAll}
            className="flex items-center gap-1 rounded-full bg-accent-audio/10 px-2 py-0.5 text-xs font-medium text-accent-audio hover:bg-accent-audio/20 active:bg-accent-audio/30 transition-colors flex-shrink-0 ml-2"
            title={`Play all ${audioFileCount} audio files`}
            aria-label={`Play all ${audioFileCount} audio files in ${node.name}`}
          >
            <PlayIcon size={12} />
            <span>Play All ({audioFileCount})</span>
          </button>
        ) : null}
      </div>

      {/* Children */}
      {node.isDirectory && isExpanded ? <div>
          {sortedChildren.map((child) => (
            <FileTreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              onFilePlay={onFilePlay}
              onFileDownload={onFileDownload}
              onPlayAll={onPlayAll}
            />
          ))}
        </div> : null}
    </div>
  );
}
