'use client';

/**
 * File Tree Component
 * 
 * Displays a hierarchical file tree with expandable folders
 */

import React, { useState, useMemo } from 'react';
import { formatBytes } from '@/lib/utils';

export interface FileItem {
  id: string;
  torrent_id: string;
  path: string;
  name: string;
  size: number;
  media_type: string;
  extension: string;
}

export interface FileTreeProps {
  files: FileItem[];
  onFileSelect: (file: FileItem) => void;
  onStream?: (file: FileItem) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: Map<string, TreeNode>;
  file?: FileItem;
}

function buildTree(files: FileItem[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isFolder: true,
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
          isFolder: !isLast,
          children: new Map(),
          file: isLast ? file : undefined,
        });
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

function getMediaIcon(mediaType: string): React.ReactElement {
  switch (mediaType) {
    case 'audio':
      return (
        <svg data-testid="icon-audio" className="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case 'video':
      return (
        <svg data-testid="icon-video" className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'ebook':
      return (
        <svg data-testid="icon-ebook" className="h-4 w-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'document':
      return (
        <svg data-testid="icon-document" className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    default:
      return (
        <svg data-testid="icon-other" className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
  }
}

function isStreamable(mediaType: string): boolean {
  return ['audio', 'video'].includes(mediaType);
}

interface TreeNodeComponentProps {
  node: TreeNode;
  depth: number;
  onFileSelect: (file: FileItem) => void;
  onStream?: (file: FileItem) => void;
}

function TreeNodeComponent({ node, depth, onFileSelect, onStream }: TreeNodeComponentProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(true);

  const sortedChildren = useMemo(() => {
    const children = Array.from(node.children.values());
    // Sort folders first, then files
    return children.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  if (node.isFolder) {
    return (
      <div className="select-none">
        <div
          className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
          <span className="text-sm text-gray-700 dark:text-gray-300">{node.name}</span>
        </div>
        {isExpanded ? <div>
            {sortedChildren.map((child) => (
              <TreeNodeComponent
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                onStream={onStream}
              />
            ))}
          </div> : null}
      </div>
    );
  }

  // File node
  const file = node.file!;
  return (
    <div
      className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
      onClick={() => onFileSelect(file)}
    >
      {getMediaIcon(file.media_type)}
      <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
        {node.name}
      </span>
      <span className="text-xs text-gray-400">{formatBytes(file.size)}</span>
      {isStreamable(file.media_type) && onStream ? <button
          onClick={(e) => {
            e.stopPropagation();
            onStream(file);
          }}
          aria-label="Stream file"
          className="hidden rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-600 group-hover:block"
        >
          Stream
        </button> : null}
    </div>
  );
}

export function FileTree({ files, onFileSelect, onStream }: FileTreeProps): React.ReactElement {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div data-testid="file-tree" className="overflow-auto rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
      {Array.from(tree.children.values()).map((child) => (
        <TreeNodeComponent
          key={child.path}
          node={child}
          depth={0}
          onFileSelect={onFileSelect}
          onStream={onStream}
        />
      ))}
    </div>
  );
}
