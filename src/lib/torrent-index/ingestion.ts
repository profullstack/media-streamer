/**
 * Torrent Ingestion Service
 * 
 * Handles magnet URL ingestion, storing torrent metadata in Supabase.
 * This is a server-side only module.
 */

import { createServerClient } from '@/lib/supabase';
import type { 
  Torrent, 
  TorrentFile as DbTorrentFile,
  TorrentInsert,
  TorrentFileInsert,
  MediaCategory,
} from '@/lib/supabase/types';
import { 
  parseMagnetUri, 
  validateMagnetUri, 
  detectMediaType,
  detectMimeType,
  getFileExtension,
} from './torrent-index';

// ============================================================================
// Types
// ============================================================================

export interface IngestResult {
  success: boolean;
  torrentId?: string;
  infohash?: string;
  error?: string;
  isDuplicate?: boolean;
}

export interface TorrentWithFiles extends Torrent {
  files: DbTorrentFile[];
}

export interface UpdateStatusResult {
  success: boolean;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

export type TorrentStatus = 'pending' | 'indexing' | 'ready' | 'error';

const VALID_STATUSES: TorrentStatus[] = ['pending', 'indexing', 'ready', 'error'];

// Map our media types to database media categories
function mapMediaTypeToCategory(mediaType: string): MediaCategory | null {
  switch (mediaType) {
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'ebook':
      return 'ebook';
    case 'image':
    case 'archive':
    case 'other':
      return 'other';
    default:
      return null;
  }
}

// ============================================================================
// Ingestion Functions
// ============================================================================

/**
 * Ingest a magnet URI into the system
 * 
 * This function:
 * 1. Validates the magnet URI
 * 2. Checks for duplicates by infohash
 * 3. Creates a torrent record in pending status
 * 4. Returns the torrent ID for further processing
 */
export async function ingestMagnet(
  magnetUri: string,
  userId: string | null
): Promise<IngestResult> {
  // Validate magnet URI
  if (!validateMagnetUri(magnetUri)) {
    return {
      success: false,
      error: 'Invalid magnet URI',
    };
  }

  try {
    // Parse the magnet URI
    const parsed = parseMagnetUri(magnetUri);
    
    // Create Supabase client
    const supabase = createServerClient();
    
    // Check for existing torrent with same infohash
    const { data: existing } = await supabase
      .from('torrents')
      .select('id, infohash')
      .eq('infohash', parsed.infohash)
      .maybeSingle();
    
    if (existing) {
      return {
        success: true,
        torrentId: existing.id,
        infohash: existing.infohash,
        isDuplicate: true,
      };
    }
    
    // Create torrent record
    const insertData: TorrentInsert = {
      infohash: parsed.infohash,
      name: parsed.name,
      magnet_uri: parsed.magnetUri,
      total_size: 0,
      file_count: 0,
      piece_length: null,
      created_by: userId,
      status: 'pending',
      error_message: null,
    };
    
    const { data: inserted, error: insertError } = await supabase
      .from('torrents')
      .insert(insertData)
      .select('id, infohash')
      .single();
    
    if (insertError) {
      return {
        success: false,
        error: `Database error: ${insertError.message}`,
      };
    }
    
    return {
      success: true,
      torrentId: inserted.id,
      infohash: inserted.infohash,
      isDuplicate: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Get a torrent by its infohash
 */
export async function getTorrentByInfohash(
  infohash: string
): Promise<TorrentWithFiles | null> {
  // Validate infohash format (40 hex characters)
  if (!/^[a-fA-F0-9]{40}$/.test(infohash)) {
    return null;
  }
  
  const normalizedHash = infohash.toLowerCase();
  
  try {
    const supabase = createServerClient();
    
    const { data: torrent, error } = await supabase
      .from('torrents')
      .select('*')
      .eq('infohash', normalizedHash)
      .maybeSingle();
    
    if (error || !torrent) {
      return null;
    }
    
    // Get files for this torrent
    const { data: files } = await supabase
      .from('torrent_files')
      .select('*')
      .eq('torrent_id', torrent.id)
      .order('file_index', { ascending: true });
    
    return {
      ...torrent,
      files: files ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Get files for a torrent by torrent ID
 */
export async function getTorrentFiles(
  torrentId: string
): Promise<DbTorrentFile[]> {
  try {
    const supabase = createServerClient();
    
    const { data: files, error } = await supabase
      .from('torrent_files')
      .select('*')
      .eq('torrent_id', torrentId)
      .order('file_index', { ascending: true });
    
    if (error) {
      return [];
    }
    
    return files ?? [];
  } catch {
    return [];
  }
}

/**
 * Update torrent status
 */
export async function updateTorrentStatus(
  torrentId: string,
  status: TorrentStatus,
  errorMessage?: string
): Promise<UpdateStatusResult> {
  // Validate status
  if (!VALID_STATUSES.includes(status)) {
    return {
      success: false,
      error: `Invalid status: ${status}`,
    };
  }
  
  try {
    const supabase = createServerClient();
    
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    
    if (status === 'ready') {
      updateData.indexed_at = new Date().toISOString();
    }
    
    if (status === 'error' && errorMessage) {
      updateData.error_message = errorMessage;
    }
    
    const { error } = await supabase
      .from('torrents')
      .update(updateData)
      .eq('id', torrentId);
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Delete a torrent and its files (cascade)
 */
export async function deleteTorrent(
  torrentId: string
): Promise<DeleteResult> {
  try {
    const supabase = createServerClient();
    
    // Files are deleted automatically via CASCADE
    const { error } = await supabase
      .from('torrents')
      .delete()
      .eq('id', torrentId);
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * File info from torrent metadata
 */
export interface TorrentFileInfo {
  path: string;
  length: number;
  pieceStart: number;
  pieceEnd: number;
}

/**
 * Store torrent files in the database
 */
export async function storeTorrentFiles(
  torrentId: string,
  files: TorrentFileInfo[]
): Promise<{ success: boolean; error?: string }> {
  if (files.length === 0) {
    return { success: true };
  }
  
  try {
    const supabase = createServerClient();
    
    const fileInserts: TorrentFileInsert[] = files.map((f, index) => {
      const extension = getFileExtension(f.path);
      const mediaType = detectMediaType(extension);
      const mimeType = detectMimeType(extension);
      const filename = f.path.split('/').pop() ?? f.path;
      
      return {
        torrent_id: torrentId,
        path: f.path,
        name: filename,
        size: f.length,
        file_index: index,
        piece_start: f.pieceStart,
        piece_end: f.pieceEnd,
        extension: extension || null,
        mime_type: mimeType,
        media_category: mapMediaTypeToCategory(mediaType),
      };
    });
    
    const { error } = await supabase
      .from('torrent_files')
      .insert(fileInserts);
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Update torrent metadata after indexing
 */
export async function updateTorrentMetadata(
  torrentId: string,
  metadata: {
    totalSize: number;
    fileCount: number;
    pieceLength: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient();
    
    const { error } = await supabase
      .from('torrents')
      .update({
        total_size: metadata.totalSize,
        file_count: metadata.fileCount,
        piece_length: metadata.pieceLength,
        updated_at: new Date().toISOString(),
      })
      .eq('id', torrentId);
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
