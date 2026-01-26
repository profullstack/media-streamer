'use client';

/**
 * File Tree Component
 *
 * Displays a hierarchical tree view of files within a torrent.
 * Supports expand/collapse, file type icons, click actions, and album cover thumbnails.
 */

import { useState, useMemo } from 'react';
import Image from 'next/image';
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
  CheckIcon,
  ShuffleIcon,
} from '@/components/ui/icons';
import type { TorrentFile, MediaCategory, FileProgress } from '@/types';
import { formatBytes } from '@/lib/utils';
import { formatProgressTime } from '@/lib/progress/progress';

/**
 * Folder metadata for album cover display
 */
export interface FolderMetadata {
  id: string;
  torrentId: string;
  path: string;
  artist: string | null;
  album: string | null;
  year: number | null;
  coverUrl: string | null;
  externalId: string | null;
  externalSource: string | null;
}

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, FileTreeNode>;
  file?: TorrentFile;
}

interface FileTreeProps {
  files: TorrentFile[];
  /** Folder metadata for album cover display */
  folders?: FolderMetadata[];
  /** Progress data keyed by file ID (for logged-in users) */
  progress?: Map<string, FileProgress>;
  onFileSelect?: (file: TorrentFile) => void;
  onFilePlay?: (file: TorrentFile) => void;
  onFileDownload?: (file: TorrentFile) => void;
  /** Callback when "Read" is clicked for an ebook file (epub/pdf) */
  onFileRead?: (file: TorrentFile) => void;
  /** Callback when "Play All" is clicked for a folder or the entire collection */
  onPlayAll?: (files: TorrentFile[]) => void;
  /** Callback when "Shuffle and Play All" is clicked for a folder or the entire collection */
  onPlayAllShuffled?: (files: TorrentFile[]) => void;
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

/**
 * Create a map of folder paths to their metadata for quick lookup
 */
function createFolderMetadataMap(folders: FolderMetadata[]): Map<string, FolderMetadata> {
  const map = new Map<string, FolderMetadata>();
  for (const folder of folders) {
    map.set(folder.path, folder);
  }
  return map;
}

export function FileTree({
  files,
  folders = [],
  progress,
  onFileSelect,
  onFilePlay,
  onFileDownload,
  onFileRead,
  onPlayAll,
  onPlayAllShuffled,
  className,
}: FileTreeProps): React.ReactElement {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const folderMetadataMap = useMemo(() => createFolderMetadataMap(folders), [folders]);

  return (
    <div className={cn('text-sm overflow-hidden w-full max-w-full', className)}>
      {Array.from(tree.children.values()).map((node) => (
        <FileTreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          folderMetadataMap={folderMetadataMap}
          progress={progress}
          onFileSelect={onFileSelect}
          onFilePlay={onFilePlay}
          onFileDownload={onFileDownload}
          onFileRead={onFileRead}
          onPlayAll={onPlayAll}
          onPlayAllShuffled={onPlayAllShuffled}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  depth: number;
  folderMetadataMap: Map<string, FolderMetadata>;
  progress?: Map<string, FileProgress>;
  onFileSelect?: (file: TorrentFile) => void;
  onFilePlay?: (file: TorrentFile) => void;
  onFileDownload?: (file: TorrentFile) => void;
  onFileRead?: (file: TorrentFile) => void;
  onPlayAll?: (files: TorrentFile[]) => void;
  onPlayAllShuffled?: (files: TorrentFile[]) => void;
}

function FileTreeNodeComponent({
  node,
  depth,
  folderMetadataMap,
  progress,
  onFileSelect,
  onFilePlay,
  onFileDownload,
  onFileRead,
  onPlayAll,
  onPlayAllShuffled,
}: FileTreeNodeComponentProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  // Get progress for this file (if it's a file)
  const fileProgress = node.file && progress ? progress.get(node.file.id) : undefined;

  // Get folder metadata for this directory (if available)
  const folderMetadata = node.isDirectory ? folderMetadataMap.get(node.path) : undefined;

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

  const handleRead = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (node.file && onFileRead) {
      onFileRead(node.file);
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

  const handlePlayAllShuffled = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onPlayAllShuffled && node.isDirectory) {
      const audioFiles = collectAudioFiles(node);
      if (audioFiles.length > 0) {
        onPlayAllShuffled(audioFiles);
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

  const Icon = useMemo(() => {
    return node.isDirectory
      ? isExpanded
        ? FolderOpenIcon
        : FolderIcon
      : node.file
        ? getMediaIcon(node.file.mediaCategory)
        : FileIcon;
  }, [node.isDirectory, isExpanded, node.file]);

  const iconColor = node.isDirectory
    ? 'text-accent-primary'
    : node.file
      ? getMediaColor(node.file.mediaCategory)
      : 'text-text-secondary';

  const isPlayable = node.file && (node.file.mediaCategory === 'audio' || node.file.mediaCategory === 'video');
  const isReadable = node.file && node.file.mediaCategory === 'ebook';

  return (
    <div className="overflow-hidden w-full">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-2 transition-colors w-full',
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
        {/* Action buttons and expand/collapse - LEFT of filename */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {node.isDirectory ? (
            <>
              {/* Expand/collapse arrow for directories */}
              <span className="flex h-5 w-5 items-center justify-center text-text-muted">
                {isExpanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
              </span>
              {/* Play All button for directories with audio files - pill style */}
              {audioFileCount > 0 && onPlayAll ? (
                <>
                  <button
                    type="button"
                    onClick={handlePlayAll}
                    className="flex items-center gap-1 rounded-full bg-accent-audio/10 px-2 py-0.5 text-xs font-medium text-accent-audio hover:bg-accent-audio/20 active:bg-accent-audio/30 transition-colors"
                    title={`Play all ${audioFileCount} audio files`}
                    aria-label={`Play all ${audioFileCount} audio files in ${node.name}`}
                  >
                    <PlayIcon size={12} />
                    <span>Play All ({audioFileCount})</span>
                  </button>
                  {onPlayAllShuffled ? (
                    <button
                      type="button"
                      onClick={handlePlayAllShuffled}
                      className="flex items-center justify-center rounded-full bg-accent-audio/10 p-1 text-accent-audio hover:bg-accent-audio/20 active:bg-accent-audio/30 transition-colors"
                      title={`Shuffle and play all ${audioFileCount} audio files`}
                      aria-label={`Shuffle and play all ${audioFileCount} audio files in ${node.name}`}
                    >
                      <ShuffleIcon size={12} />
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <>
              {/* Play button for playable files (audio/video) */}
              {isPlayable && onFilePlay ? (
                <button
                  type="button"
                  onClick={handlePlay}
                  className="rounded-full p-2 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/30 active:bg-accent-primary/40 transition-colors"
                  title="Play"
                  aria-label={`Play ${node.name}`}
                >
                  <PlayIcon size={20} />
                </button>
              ) : null}
              {/* Read button for ebook files (epub/pdf) */}
              {isReadable && onFileRead ? (
                <button
                  type="button"
                  onClick={handleRead}
                  className="rounded-full p-2 bg-accent-ebook/10 text-accent-ebook hover:bg-accent-ebook/30 active:bg-accent-ebook/40 transition-colors"
                  title="Read"
                  aria-label={`Read ${node.name}`}
                >
                  <BookIcon size={20} />
                </button>
              ) : null}
              {/* Download button for files */}
              {onFileDownload ? (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-full p-2 bg-accent-secondary/10 text-accent-secondary hover:bg-accent-secondary/30 active:bg-accent-secondary/40 transition-colors"
                  title="Download"
                  aria-label={`Download ${node.name}`}
                >
                  <DownloadIcon size={20} />
                </button>
              ) : null}
              {/* Spacer if no action buttons */}
              {!isPlayable && !isReadable && !onFileDownload && <span className="w-5" />}
            </>
          )}
        </div>

        {/* Album cover thumbnail for folders with cover art - rectangular poster format */}
        {node.isDirectory && folderMetadata?.coverUrl ? (
          <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-bg-tertiary">
            <Image
              src={folderMetadata.coverUrl}
              alt={folderMetadata.album ?? node.name}
              fill
              sizes="40px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          /* Icon (only show if no cover art) */
          /* eslint-disable-next-line react-hooks/static-components -- Dynamic icon selection */
          <Icon className={cn(iconColor, 'flex-shrink-0')} size={18} />
        )}

        {/* Name and album info - min-w-0 and overflow-hidden are required for truncate to work in flex container */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <span className="truncate text-text-primary block break-all">{node.name}</span>
          {/* Show album/artist info for folders with metadata */}
          {node.isDirectory && folderMetadata && (folderMetadata.artist || folderMetadata.year) ? (
            <span className="text-xs text-text-muted truncate block break-all">
              {folderMetadata.artist}
              {folderMetadata.artist && folderMetadata.year ? ' • ' : ''}
              {folderMetadata.year}
            </span>
          ) : null}
          {/* Progress bar for files with progress */}
          {!node.isDirectory && fileProgress && fileProgress.percentage > 0 ? (
            <div className="mt-1 flex items-center gap-2">
              {/* Progress bar */}
              <div className="h-1 flex-1 max-w-32 rounded-full bg-bg-tertiary overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    fileProgress.completed ? 'bg-green-500' : 'bg-accent-primary'
                  )}
                  style={{ width: `${Math.min(fileProgress.percentage, 100)}%` }}
                />
              </div>
              {/* Time or percentage text */}
              <span className="text-[10px] text-text-muted">
                {fileProgress.currentTimeSeconds !== undefined && fileProgress.durationSeconds
                  ? formatProgressTime(fileProgress.currentTimeSeconds)
                  : `${fileProgress.percentage.toFixed(0)}%`}
              </span>
              {/* Completed checkmark */}
              {fileProgress.completed ? (
                <CheckIcon className="h-3 w-3 text-green-500 flex-shrink-0" />
              ) : null}
            </div>
          ) : null}
        </div>

        {/* File size */}
        {node.file ? <span className="text-xs text-text-muted flex-shrink-0 ml-2">{formatBytes(node.file.size)}</span> : null}
      </div>

      {/* Children */}
      {node.isDirectory && isExpanded ? <div>
          {sortedChildren.map((child) => (
            <FileTreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              folderMetadataMap={folderMetadataMap}
              progress={progress}
              onFileSelect={onFileSelect}
              onFilePlay={onFilePlay}
              onFileDownload={onFileDownload}
              onFileRead={onFileRead}
              onPlayAll={onPlayAll}
              onPlayAllShuffled={onPlayAllShuffled}
            />
          ))}
        </div> : null}
    </div>
  );
}
