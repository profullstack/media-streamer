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
  className,
}: FileTreeProps): React.ReactElement {
  const tree = useMemo(() => buildFileTree(files), [files]);

  return (
    <div className={cn('text-sm', className)}>
      {Array.from(tree.children.values()).map((node) => (
        <FileTreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          onFileSelect={onFileSelect}
          onFilePlay={onFilePlay}
          onFileDownload={onFileDownload}
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
}

function FileTreeNodeComponent({
  node,
  depth,
  onFileSelect,
  onFilePlay,
  onFileDownload,
}: FileTreeNodeComponentProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

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
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
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
            node.isDirectory ? handleToggle() : handleClick();
          }
        }}
      >
        {/* Expand/collapse arrow for directories */}
        {node.isDirectory ? (
          <span className="flex h-4 w-4 items-center justify-center text-text-muted">
            {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </span>
        ) : (
          <span className="h-4 w-4" />
        )}

        {/* Icon */}
        <Icon className={iconColor} size={16} />

        {/* Name */}
        <span className="flex-1 truncate text-text-primary">{node.name}</span>

        {/* File size */}
        {node.file && (
          <span className="text-xs text-text-muted">{formatBytes(node.file.size)}</span>
        )}

        {/* Action buttons for files */}
        {!node.isDirectory && node.file && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {isPlayable && onFilePlay && (
              <button
                type="button"
                onClick={handlePlay}
                className="rounded p-1 text-text-secondary hover:bg-accent-primary/20 hover:text-accent-primary"
                title="Play"
              >
                <PlayIcon size={14} />
              </button>
            )}
            {onFileDownload && (
              <button
                type="button"
                onClick={handleDownload}
                className="rounded p-1 text-text-secondary hover:bg-accent-secondary/20 hover:text-accent-secondary"
                title="Download"
              >
                <DownloadIcon size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {node.isDirectory && isExpanded && (
        <div>
          {sortedChildren.map((child) => (
            <FileTreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              onFilePlay={onFilePlay}
              onFileDownload={onFileDownload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
