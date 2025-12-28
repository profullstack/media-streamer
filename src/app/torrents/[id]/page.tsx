'use client';

/**
 * Torrent Detail Page
 *
 * Shows torrent information and file browser.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { FileTree } from '@/components/files';
import { SearchBar, type SearchFilters } from '@/components/search';
import { MediaPlayerModal, PlaylistPlayerModal } from '@/components/media';
import {
  MagnetIcon,
  ChevronRightIcon,
  LoadingSpinner,
  MusicIcon,
  VideoIcon,
  BookIcon,
  FileIcon,
  PlayIcon,
} from '@/components/ui/icons';
import { formatBytes } from '@/lib/utils';
import { extractArtistFromTorrentName } from '@/lib/torrent-name';
import type { Torrent, TorrentFile } from '@/types';

interface TorrentDetailResponse {
  torrent: Torrent;
  files: TorrentFile[];
}

/**
 * Folder metadata from the API
 */
interface FolderMetadata {
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

interface FoldersResponse {
  folders: FolderMetadata[];
}

/**
 * Find the best matching folder metadata for a set of files
 * Returns the folder whose path is the common parent of all files
 */
function findFolderMetadataForFiles(
  files: TorrentFile[],
  folders: FolderMetadata[]
): FolderMetadata | undefined {
  if (files.length === 0 || folders.length === 0) return undefined;

  // Get the common path prefix of all files
  const paths = files.map(f => f.path);
  const firstPath = paths[0];
  const parts = firstPath.split('/').filter(Boolean);
  
  // Find the longest common prefix
  let commonPrefix = '';
  for (let i = 0; i < parts.length - 1; i++) {
    const testPrefix = parts.slice(0, i + 1).join('/');
    const allMatch = paths.every(p => p.startsWith(testPrefix + '/') || p === testPrefix);
    if (allMatch) {
      commonPrefix = testPrefix;
    } else {
      break;
    }
  }

  if (!commonPrefix) return undefined;

  // Find the folder that matches this path
  return folders.find(f => f.path === commonPrefix);
}

export default function TorrentDetailPage(): React.ReactElement {
  const params = useParams();
  const torrentId = params.id as string;

  const [torrent, setTorrent] = useState<Torrent | null>(null);
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<TorrentFile[]>([]);
  const [folders, setFolders] = useState<FolderMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal state
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Playlist modal state
  const [playlistFiles, setPlaylistFiles] = useState<TorrentFile[]>([]);
  const [playlistFolderMetadata, setPlaylistFolderMetadata] = useState<FolderMetadata | undefined>(undefined);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);

  // Fetch torrent details and folder metadata
  useEffect(() => {
    const fetchTorrent = async (): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch torrent details
        const response = await fetch(`/api/torrents/${torrentId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Torrent not found');
          }
          const errorData = await response.json() as { error?: string };
          throw new Error(errorData.error ?? 'Failed to load torrent');
        }

        const data = await response.json() as TorrentDetailResponse;
        // Debug: Log cover art URLs
        console.log('[TorrentDetailPage] Torrent metadata:', {
          name: data.torrent.name,
          coverUrl: data.torrent.coverUrl,
          posterUrl: data.torrent.posterUrl,
          contentType: data.torrent.contentType,
        });
        setTorrent(data.torrent);
        setFiles(data.files);
        setFilteredFiles(data.files);

        // Fetch folder metadata for album-level cover art
        try {
          const foldersResponse = await fetch(`/api/torrents/${torrentId}/folders`);
          if (foldersResponse.ok) {
            const foldersData = await foldersResponse.json() as FoldersResponse;
            console.log('[TorrentDetailPage] Folder metadata:', foldersData.folders);
            setFolders(foldersData.folders);
          }
        } catch (folderErr) {
          // Non-critical error - folder metadata is optional
          console.warn('[TorrentDetailPage] Failed to fetch folder metadata:', folderErr);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    if (torrentId) {
      void fetchTorrent();
    }
  }, [torrentId]);

  // Handle search within torrent
  const handleSearch = useCallback((query: string, filters: SearchFilters) => {
    if (!query.trim() && filters.mediaTypes.length === 0) {
      setFilteredFiles(files);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = files.filter((file) => {
      // Filter by query
      const matchesQuery = !query.trim() || 
        file.name.toLowerCase().includes(lowerQuery) ||
        file.path.toLowerCase().includes(lowerQuery);

      // Filter by media type
      const matchesType = filters.mediaTypes.length === 0 ||
        filters.mediaTypes.includes(file.mediaCategory);

      return matchesQuery && matchesType;
    });

    setFilteredFiles(filtered);
  }, [files]);

  // Handle file play - opens modal instead of new tab
  const handleFilePlay = useCallback((file: TorrentFile) => {
    if (torrent) {
      setSelectedFile(file);
      setIsModalOpen(true);
    }
  }, [torrent]);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedFile(null);
  }, []);

  // Handle play all - opens playlist modal with folder-specific metadata
  const handlePlayAll = useCallback((audioFiles: TorrentFile[]) => {
    if (audioFiles.length > 0) {
      // Find folder metadata for these files
      const folderMeta = findFolderMetadataForFiles(audioFiles, folders);
      console.log('[TorrentDetailPage] Play all with folder metadata:', {
        fileCount: audioFiles.length,
        folderPath: folderMeta?.path,
        folderCoverUrl: folderMeta?.coverUrl,
        folderArtist: folderMeta?.artist,
        folderAlbum: folderMeta?.album,
      });
      setPlaylistFolderMetadata(folderMeta);
      setPlaylistFiles(audioFiles);
      setIsPlaylistModalOpen(true);
    }
  }, [folders]);

  // Handle playlist modal close
  const handlePlaylistModalClose = useCallback(() => {
    setIsPlaylistModalOpen(false);
    setPlaylistFiles([]);
    setPlaylistFolderMetadata(undefined);
  }, []);

  // Get all audio files from the torrent (sorted by path)
  const allAudioFiles = useMemo(() => {
    return files
      .filter((file) => file.mediaCategory === 'audio')
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  // Handle file download
  const handleFileDownload = useCallback((file: TorrentFile) => {
    if (torrent) {
      const streamUrl = `/api/stream?infohash=${torrent.infohash}&fileIndex=${file.fileIndex}`;
      const link = document.createElement('a');
      link.href = streamUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [torrent]);

  // Calculate media type counts
  const mediaCounts = files.reduce(
    (acc, file) => {
      acc[file.mediaCategory] = (acc[file.mediaCategory] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size={32} className="text-accent-primary" />
          <span className="ml-3 text-text-secondary">Loading torrent...</span>
        </div>
      </MainLayout>
    );
  }

  if (error || !torrent) {
    return (
      <MainLayout>
        <div className="py-12 text-center">
          <p className="text-error">{error ?? 'Torrent not found'}</p>
          <Link
            href="/torrents"
            className="mt-4 inline-block text-accent-primary hover:underline"
          >
            Back to torrents
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-text-muted">
          <Link href="/torrents" className="hover:text-text-primary">
            Torrents
          </Link>
          <ChevronRightIcon size={14} />
          <span className="text-text-primary">{torrent.name}</span>
        </nav>

        {/* Header */}
        <div className="card p-6">
          <div className="flex items-start gap-4">
            {/* Poster/Cover Art or Fallback Icon */}
            {torrent.posterUrl || torrent.coverUrl ? (
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg shadow-lg sm:h-32 sm:w-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={torrent.posterUrl ?? torrent.coverUrl ?? ''}
                  alt={torrent.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-primary/20">
                <MagnetIcon className="text-accent-primary" size={24} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold text-text-primary">
                {torrent.name}
              </h1>
              <p className="mt-1 font-mono text-xs text-text-muted">
                {torrent.infohash}
              </p>
              {/* Content type and year */}
              {(torrent.contentType || torrent.year) && (
                <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                  {torrent.contentType && (
                    <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs capitalize">
                      {torrent.contentType}
                    </span>
                  )}
                  {torrent.year && <span>{torrent.year}</span>}
                </div>
              )}
              {/* Description */}
              {torrent.description && (
                <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
                  {torrent.description}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-sm text-text-muted">Total Size</p>
              <p className="text-lg font-medium text-text-primary">
                {formatBytes(torrent.totalSize)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Files</p>
              <p className="text-lg font-medium text-text-primary">
                {torrent.fileCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Seeders</p>
              <p className="text-lg font-medium text-green-500">
                {torrent.seeders !== null ? torrent.seeders : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Leechers</p>
              <p className="text-lg font-medium text-orange-500">
                {torrent.leechers !== null ? torrent.leechers : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Piece Size</p>
              <p className="text-lg font-medium text-text-primary">
                {formatBytes(torrent.pieceLength)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Added</p>
              <p className="text-lg font-medium text-text-primary">
                {new Date(torrent.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Media type breakdown */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Play All button for audio collections */}
            {allAudioFiles.length > 1 ? (
              <button
                type="button"
                onClick={() => handlePlayAll(allAudioFiles)}
                className="flex items-center gap-2 rounded-full bg-accent-audio px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-audio/90 transition-colors"
              >
                <PlayIcon size={14} />
                <span>Play All ({allAudioFiles.length})</span>
              </button>
            ) : null}
            {mediaCounts.audio && mediaCounts.audio > 0 ? <div className="flex items-center gap-2 rounded-full bg-accent-audio/10 px-3 py-1 text-sm">
                <MusicIcon className="text-accent-audio" size={14} />
                <span className="text-text-primary">{mediaCounts.audio} audio</span>
              </div> : null}
            {mediaCounts.video && mediaCounts.video > 0 ? <div className="flex items-center gap-2 rounded-full bg-accent-video/10 px-3 py-1 text-sm">
                <VideoIcon className="text-accent-video" size={14} />
                <span className="text-text-primary">{mediaCounts.video} video</span>
              </div> : null}
            {mediaCounts.ebook && mediaCounts.ebook > 0 ? <div className="flex items-center gap-2 rounded-full bg-accent-ebook/10 px-3 py-1 text-sm">
                <BookIcon className="text-accent-ebook" size={14} />
                <span className="text-text-primary">{mediaCounts.ebook} ebook</span>
              </div> : null}
            {mediaCounts.document && mediaCounts.document > 0 ? <div className="flex items-center gap-2 rounded-full bg-bg-tertiary px-3 py-1 text-sm">
                <FileIcon className="text-text-secondary" size={14} />
                <span className="text-text-primary">{mediaCounts.document} document</span>
              </div> : null}
            {mediaCounts.other && mediaCounts.other > 0 ? <div className="flex items-center gap-2 rounded-full bg-bg-tertiary px-3 py-1 text-sm">
                <FileIcon className="text-text-secondary" size={14} />
                <span className="text-text-primary">{mediaCounts.other} other</span>
              </div> : null}
          </div>
        </div>

        {/* File Browser */}
        <div className="card">
          <div className="border-b border-border-subtle p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">Files</h2>
              <span className="text-sm text-text-muted">
                {filteredFiles.length} of {files.length} files
              </span>
            </div>
            <div className="mt-3">
              <SearchBar
                onSearch={handleSearch}
                placeholder="Filter files..."
                showFilters={true}
                debounceMs={150}
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto p-2">
            {filteredFiles.length > 0 ? (
              <FileTree
                files={filteredFiles}
                onFilePlay={handleFilePlay}
                onFileDownload={handleFileDownload}
                onPlayAll={handlePlayAll}
              />
            ) : (
              <div className="py-8 text-center text-text-muted">
                No files match your filter
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Player Modal */}
      {torrent ? <MediaPlayerModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          file={selectedFile}
          infohash={torrent.infohash}
          torrentName={torrent.name}
        /> : null}

      {/* Playlist Player Modal - uses folder-specific metadata when available */}
      {torrent ? <PlaylistPlayerModal
          isOpen={isPlaylistModalOpen}
          onClose={handlePlaylistModalClose}
          files={playlistFiles}
          infohash={torrent.infohash}
          torrentName={playlistFolderMetadata?.album ?? torrent.name}
          coverArt={playlistFolderMetadata?.coverUrl ?? torrent.coverUrl ?? torrent.posterUrl ?? undefined}
          artist={playlistFolderMetadata?.artist ?? extractArtistFromTorrentName(torrent.name)}
        /> : null}
    </MainLayout>
  );
}
