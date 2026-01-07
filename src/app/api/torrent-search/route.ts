/**
 * Torrent Search API Route
 * 
 * Searches across multiple torrent providers using the torge CLI tool.
 * Returns aggregated results with metadata like seeders, leechers, size, etc.
 * 
 * @endpoint GET /api/torrent-search
 * @query q - Search query (required, min 3 chars, max 500 chars)
 * @query sort - Sort order: date, size, seeders, leechers (default: date)
 * @query provider - Filter by specific provider (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

// Valid sort options
const VALID_SORT_OPTIONS = ['date', 'size', 'seeders', 'leechers'] as const;
type SortOption = typeof VALID_SORT_OPTIONS[number];

// Valid providers (matching torge-all.sh)
const VALID_PROVIDERS = ['thepiratebay', 'limetorrents', '1337x', 'rarbg', 'nyaa', 'libgen'] as const;
type Provider = typeof VALID_PROVIDERS[number];

// Torrent result from a single provider
interface TorrentResult {
  name: string;
  magnet: string;
  size: string;
  seeders: number;
  leechers: number;
  date?: string;
  url?: string;
  category?: string;
  uploader?: string;
}

// Provider results
interface ProviderResults {
  provider: string;
  results: TorrentResult[];
}

// API response
interface TorrentSearchResponse {
  query: string;
  results: ProviderResults[];
  totalResults: number;
  timestamp: string;
}

// Search timeout in milliseconds (120 seconds)
// Increased from 60s to handle slow torrent providers across 6 providers
// Each provider may take up to 20s, and we search sequentially
const SEARCH_TIMEOUT = 120000;

/**
 * Sanitize query to prevent command injection
 * Removes shell metacharacters while preserving search intent
 */
function sanitizeQuery(query: string): string {
  // Remove shell metacharacters that could be used for injection
  // Keep alphanumeric, spaces, hyphens, underscores, dots, and parentheses
  return query
    .replace(/[;&|`$\\<>!]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

// Raw result from torge (uses 'link' field for magnet URL)
interface RawTorrentResult {
  name: string;
  link: string;  // torge uses 'link' for magnet URL
  size: string;
  seeders: number;
  leechers: number;
  date?: string;
  url?: string;
  category?: string;
  uploader?: string;
}

interface RawProviderResults {
  provider: string;
  results: RawTorrentResult[];
}

/**
 * Transform raw torge results to normalized format
 * - Maps 'link' field to 'magnet'
 * - Filters out results without valid magnet URLs
 */
function normalizeResults(rawResults: RawProviderResults[]): ProviderResults[] {
  return rawResults.map((providerResult) => ({
    provider: providerResult.provider,
    results: providerResult.results
      // Filter: only include results with valid magnet URLs
      .filter((result) => result.link && result.link.startsWith('magnet:?'))
      // Transform: map 'link' to 'magnet'
      .map((result) => ({
        name: result.name,
        magnet: result.link,  // Map 'link' to 'magnet'
        size: result.size,
        seeders: result.seeders,
        leechers: result.leechers,
        date: result.date,
        url: result.url,
        category: result.category,
        uploader: result.uploader,
      })),
  }));
}

/**
 * Execute torge search script and return results
 */
async function executeTorgeSearch(
  query: string,
  sort: SortOption
): Promise<ProviderResults[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'bin', 'torge-all.sh');
    const sanitizedQuery = sanitizeQuery(query);

    // Spawn the torge-all.sh script
    const child = spawn('bash', [scriptPath, sanitizedQuery, '-s', sort], {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    // Set timeout
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Search timeout'));
    }, SEARCH_TIMEOUT);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeout);

      if (code !== 0) {
        console.error('[TorrentSearch] Script error:', stderr);
        reject(new Error('Torrent search failed'));
        return;
      }

      try {
        // Parse the JSON output from torge-all.sh
        const rawResults = JSON.parse(stdout) as RawProviderResults[];
        // Normalize results: map 'link' to 'magnet' and filter invalid entries
        const results = normalizeResults(rawResults);
        resolve(results);
      } catch (parseError) {
        console.error('[TorrentSearch] JSON parse error:', parseError);
        console.error('[TorrentSearch] stdout:', stdout);
        console.error('[TorrentSearch] stderr:', stderr);
        reject(new Error('Torrent search failed'));
      }
    });

    child.on('error', (error: Error) => {
      clearTimeout(timeout);
      console.error('[TorrentSearch] Spawn error:', error);
      reject(new Error('Torrent search failed'));
    });
  });
}

/**
 * Validate sort parameter
 */
function isValidSort(sort: string): sort is SortOption {
  return VALID_SORT_OPTIONS.includes(sort as SortOption);
}

/**
 * Validate provider parameter
 */
function isValidProvider(provider: string): provider is Provider {
  return VALID_PROVIDERS.includes(provider as Provider);
}

/**
 * GET /api/torrent-search
 * Search for torrents across multiple providers
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const sort = searchParams.get('sort') ?? 'date';
  const provider = searchParams.get('provider');

  // Validate query parameter
  if (!query || query.trim() === '') {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  // Validate query length
  if (query.length < 3) {
    return NextResponse.json(
      { error: 'Query must be at least 3 characters' },
      { status: 400 }
    );
  }

  if (query.length > 500) {
    return NextResponse.json(
      { error: 'Query too long (max 500 characters)' },
      { status: 400 }
    );
  }

  // Validate sort parameter
  if (!isValidSort(sort)) {
    return NextResponse.json(
      { error: `Invalid sort parameter. Valid options: ${VALID_SORT_OPTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate provider parameter if provided
  if (provider && !isValidProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Valid options: ${VALID_PROVIDERS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    // Execute torge search
    let results = await executeTorgeSearch(query, sort);

    // Filter by provider if specified
    if (provider) {
      results = results.filter((r) => r.provider === provider);
    }

    // Calculate total results across all providers
    const totalResults = results.reduce(
      (sum, providerResult) => sum + providerResult.results.length,
      0
    );

    const response: TorrentSearchResponse = {
      query,
      results,
      totalResults,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[TorrentSearch] Error:', error);

    if (error instanceof Error && error.message === 'Search timeout') {
      return NextResponse.json(
        { error: 'Search timeout' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Torrent search failed' },
      { status: 500 }
    );
  }
}
