'use client';

/**
 * Torrent Detail Page
 *
 * Shows torrent information, file browser, comments, and voting.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { FileTree } from '@/components/files';
import { SearchBar, type SearchFilters } from '@/components/search';
import { MediaPlayerModal, PlaylistPlayerModal } from '@/components/media';
import { CommentsSection, TorrentVoting } from '@/components/comments';
import {
  ChevronRightIcon,
  LoadingSpinner,
  MusicIcon,
  VideoIcon,
  BookIcon,
  FileIcon,
  PlayIcon,
  ShuffleIcon,
} from '@/components/ui/icons';
import { MediaPoster, type MediaContentType } from '@/components/ui/media-placeholder';
import { AmazonBuyButton } from '@/components/ui/amazon-buy-button';
import { formatBytes } from '@/lib/utils';
import { extractArtistFromTorrentName } from '@/lib/torrent-name';
import { calculateHealthBars, getHealthBarColors } from '@/lib/torrent-health';
import { useAuth } from '@/hooks';
import type { Torrent, TorrentFile, FileProgress } from '@/types';

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
  const router = useRouter();
  const torrentId = params.id as string;
  const { user } = useAuth();

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

  // Progress tracking state (for logged-in users only)
  const [fileProgress, setFileProgress] = useState<Map<string, FileProgress>>(new Map());

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

  // Set page title and meta description for SEO
  useEffect(() => {
    if (!torrent) return;
    const title = torrent.cleanTitle ?? torrent.name;
    const parts = [title];
    if (torrent.year) parts.push(`(${torrent.year})`);
    if (torrent.contentType) parts.push(`- ${torrent.contentType.charAt(0).toUpperCase() + torrent.contentType.slice(1)}`);
    document.title = `${parts.join(' ')} | BitTorrented`;

    // Update or create meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    const desc = torrent.description
      ? `${torrent.description.slice(0, 155)}…`
      : `Stream or download ${title} on BitTorrented. ${torrent.fileCount} file${torrent.fileCount !== 1 ? 's' : ''}, ${formatBytes(torrent.totalSize)}.`;
    metaDesc.setAttribute('content', desc);
  }, [torrent]);

  // Fetch progress for logged-in users
  useEffect(() => {
    if (!user || !torrentId) {
      setFileProgress(new Map());
      return;
    }

    const fetchProgress = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/torrents/${torrentId}/progress`);
        if (response.ok) {
          const data = await response.json() as {
            watchProgress: Array<{
              fileId: string;
              currentTimeSeconds: number;
              durationSeconds: number | null;
              percentage: number;
              lastWatchedAt: string;
            }>;
            readingProgress: Array<{
              fileId: string;
              currentPage: number;
              totalPages: number | null;
              percentage: number;
              lastReadAt: string;
            }>;
          };

          // Convert to Map for O(1) lookups
          const progressMap = new Map<string, FileProgress>();

          // Add watch progress
          for (const wp of data.watchProgress) {
            progressMap.set(wp.fileId, {
              fileId: wp.fileId,
              percentage: wp.percentage,
              completed: wp.percentage >= 95,
              currentTimeSeconds: wp.currentTimeSeconds,
              durationSeconds: wp.durationSeconds ?? undefined,
              lastWatchedAt: wp.lastWatchedAt,
            });
          }

          // Add reading progress
          for (const rp of data.readingProgress) {
            progressMap.set(rp.fileId, {
              fileId: rp.fileId,
              percentage: rp.percentage,
              completed: rp.percentage >= 95,
              currentPage: rp.currentPage,
              totalPages: rp.totalPages ?? undefined,
              lastReadAt: rp.lastReadAt,
            });
          }

          setFileProgress(progressMap);
        }
      } catch (err) {
        console.warn('[TorrentDetailPage] Failed to fetch progress:', err);
      }
    };

    void fetchProgress();
  }, [user, torrentId]);

  // Handle saving progress (called by media player)
  const handleProgressSave = useCallback(async (
    fileId: string,
    currentTimeSeconds: number,
    durationSeconds: number
  ): Promise<void> => {
    if (!user || !torrentId) return;

    try {
      await fetch(`/api/torrents/${torrentId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          currentTimeSeconds,
          durationSeconds,
        }),
      });

      // Update local progress state
      setFileProgress(prev => {
        const updated = new Map(prev);
        const percentage = durationSeconds > 0
          ? (currentTimeSeconds / durationSeconds) * 100
          : 0;
        updated.set(fileId, {
          fileId,
          percentage,
          completed: percentage >= 95,
          currentTimeSeconds,
          durationSeconds,
          lastWatchedAt: new Date().toISOString(),
        });
        return updated;
      });
    } catch (err) {
      console.warn('[TorrentDetailPage] Failed to save progress:', err);
    }
  }, [user, torrentId]);

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

  // Handle file read - navigates to reader page for ebooks
  const handleFileRead = useCallback((file: TorrentFile) => {
    router.push(`/reader/${file.id}`);
  }, [router]);

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

  // Handle play all shuffled - shuffles files before playing
  const handlePlayAllShuffled = useCallback((audioFiles: TorrentFile[]) => {
    if (audioFiles.length > 0) {
      // Log original order (first 5 files) for debugging
      console.log('[Shuffle] Original order (first 5):', audioFiles.slice(0, 5).map(f => f.path));

      // Shuffle the array using Fisher-Yates algorithm
      const shuffled = [...audioFiles];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Log shuffled order (first 10 files) for debugging
      console.log('[Shuffle] Shuffled order (first 10):', shuffled.slice(0, 10).map(f => f.path));
      console.log('[Shuffle] Total files shuffled:', shuffled.length);

      // Find folder metadata for these files
      const folderMeta = findFolderMetadataForFiles(audioFiles, folders);
      setPlaylistFolderMetadata(folderMeta);
      setPlaylistFiles(shuffled);
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

  // Set document title to include infohash for SEO
  useEffect(() => {
    if (torrent) {
      document.title = `${torrent.cleanTitle ?? torrent.name} (${torrent.infohash}) | BitTorrented`;
    }
  }, [torrent]);

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
          <span className="text-text-primary" title={torrent.name}>{torrent.cleanTitle ?? torrent.name}</span>
        </nav>

        {/* Header */}
        <div className="card p-6">
          <div className="flex items-start gap-4">
            {/* Poster/Cover Art with Placeholder */}
            <MediaPoster
              src={torrent.posterUrl ?? torrent.coverUrl}
              alt={torrent.cleanTitle ?? torrent.name}
              contentType={torrent.contentType as MediaContentType}
              className="shadow-lg"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold text-text-primary" title={torrent.name}>
                {torrent.cleanTitle ?? torrent.name}
              </h1>
              <p className="mt-1 font-mono text-xs text-text-muted">
                {torrent.infohash}
              </p>
              {/* Content type, year, and genre */}
              {(torrent.contentType || torrent.year || torrent.genre) ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                  {torrent.contentType ? <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs capitalize">
                      {torrent.contentType}
                    </span> : null}
                  {torrent.year ? <span>{torrent.year}</span> : null}
                  {torrent.genre ? <span className="text-text-muted">•</span> : null}
                  {torrent.genre ? <span className="text-text-secondary">{torrent.genre}</span> : null}
                </div> : null}
              {/* Director and Cast */}
              {(torrent.director || torrent.actors) ? <div className="mt-2 space-y-1 text-sm">
                  {torrent.director ? <p className="text-text-secondary">
                      <span className="text-text-muted">Director:</span>{' '}
                      <span className="text-text-primary">{torrent.director}</span>
                    </p> : null}
                  {torrent.actors ? <p className="text-text-secondary">
                      <span className="text-text-muted">Cast:</span>{' '}
                      <span className="text-text-primary">{torrent.actors}</span>
                    </p> : null}
                </div> : null}
              {/* Description */}
              {torrent.description ? <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                  {torrent.description}
                </p> : null}
              {/* Buy on Amazon affiliate link — only when we have real metadata */}
              <AmazonBuyButton
                title={torrent.cleanTitle ?? torrent.name}
                contentType={torrent.contentType}
                hasMetadata={true}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
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
              <p className="text-sm text-text-muted">Health</p>
              <div className="mt-1 flex items-center gap-0.5" title={`Health: ${calculateHealthBars(torrent.seeders, torrent.leechers)}/5`}>
                {getHealthBarColors(calculateHealthBars(torrent.seeders, torrent.leechers)).map((color, index) => (
                  <div
                    key={index}
                    className={`w-2 rounded-sm ${color}`}
                    style={{ height: `${12 + index * 3}px` }}
                  />
                ))}
              </div>
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

          {/* Encoding Info - show if codec info is available */}
          {torrent.videoCodec || torrent.audioCodec ? (
            <div className="mt-6 rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <h3 className="text-sm font-medium text-text-primary mb-3">Encoding Details</h3>
              <div className="flex flex-wrap items-center gap-3">
                {torrent.videoCodec ? (
                  <div className="flex items-center gap-2 rounded-full bg-accent-video/10 px-3 py-1 text-sm">
                    <VideoIcon className="text-accent-video" size={14} />
                    <span className="text-text-primary">{torrent.videoCodec.toUpperCase()}</span>
                  </div>
                ) : null}
                {torrent.audioCodec ? (
                  <div className="flex items-center gap-2 rounded-full bg-accent-audio/10 px-3 py-1 text-sm">
                    <MusicIcon className="text-accent-audio" size={14} />
                    <span className="text-text-primary">{torrent.audioCodec.toUpperCase()}</span>
                  </div>
                ) : null}
                {torrent.container ? (
                  <div className="flex items-center gap-2 rounded-full bg-bg-tertiary px-3 py-1 text-sm">
                    <FileIcon className="text-text-secondary" size={14} />
                    <span className="text-text-primary">{torrent.container.toUpperCase()}</span>
                  </div>
                ) : null}
                {torrent.needsTranscoding !== null ? (
                  <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
                    torrent.needsTranscoding
                      ? 'bg-orange-500/10 text-orange-500'
                      : 'bg-green-500/10 text-green-500'
                  }`}>
                    {torrent.needsTranscoding ? (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>Needs Transcoding</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Browser Compatible</span>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
              {torrent.codecDetectedAt ? (
                <p className="mt-2 text-xs text-text-muted">
                  Detected: {new Date(torrent.codecDetectedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Media type breakdown */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Play All button for audio collections */}
            {allAudioFiles.length > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handlePlayAll(allAudioFiles)}
                  className="flex items-center gap-2 rounded-full bg-accent-audio px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-audio/90 transition-colors"
                >
                  <PlayIcon size={14} />
                  <span>Play All ({allAudioFiles.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePlayAllShuffled(allAudioFiles)}
                  className="flex items-center justify-center rounded-full bg-accent-audio/20 p-1.5 text-accent-audio hover:bg-accent-audio/30 transition-colors"
                  title="Shuffle and play all"
                  aria-label="Shuffle and play all audio files"
                >
                  <ShuffleIcon size={14} />
                </button>
              </div>
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

          {/* Torrent Voting */}
          <div className="mt-6 border-t border-border-subtle pt-6">
            <TorrentVoting
              torrentId={torrentId}
              user={user ? { id: user.id, email: user.email ?? '' } : null}
            />
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
                folders={folders}
                progress={user ? fileProgress : undefined}
                onFilePlay={handleFilePlay}
                onFileDownload={handleFileDownload}
                onFileRead={handleFileRead}
                onPlayAll={handlePlayAll}
                onPlayAllShuffled={handlePlayAllShuffled}
              />
            ) : (
              <div className="py-8 text-center text-text-muted">
                No files match your filter
              </div>
            )}
          </div>
        </div>

        {/* Comments Section */}
        <div className="card p-6">
          <CommentsSection
            torrentId={torrentId}
            user={user ? { id: user.id, email: user.email ?? '' } : null}
          />
        </div>
      </div>

      {/* Media Player Modal */}
      {torrent ? <MediaPlayerModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          file={selectedFile}
          infohash={torrent.infohash}
          torrentName={torrent.cleanTitle ?? torrent.name}
          existingProgress={selectedFile && user ? fileProgress.get(selectedFile.id) : undefined}
          onProgressSave={user ? handleProgressSave : undefined}
        /> : null}

      {/* Playlist Player Modal - uses folder-specific metadata when available */}
      {torrent ? <PlaylistPlayerModal
          isOpen={isPlaylistModalOpen}
          onClose={handlePlaylistModalClose}
          files={playlistFiles}
          infohash={torrent.infohash}
          torrentName={playlistFolderMetadata?.album ?? torrent.cleanTitle ?? torrent.name}
          coverArt={playlistFolderMetadata?.coverUrl ?? torrent.coverUrl ?? torrent.posterUrl ?? undefined}
          artist={playlistFolderMetadata?.artist ?? extractArtistFromTorrentName(torrent.name)}
        /> : null}
    </MainLayout>
  );
}
