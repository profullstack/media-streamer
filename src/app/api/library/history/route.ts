/**
 * Library History API Route
 *
 * GET - Get user's combined watch and reading history
 * DELETE - Clear all history
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLibraryRepository } from '@/lib/library';
import type { HistoryItem } from '@/lib/library';

/**
 * History response
 */
interface HistoryResponse {
  history: HistoryItem[];
}

/**
 * Success response
 */
interface SuccessResponse {
  success: boolean;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

/**
 * GET /api/library/history
 *
 * Get current user's combined watch and reading history
 */
export async function GET(
  request: Request
): Promise<NextResponse<HistoryResponse | ErrorResponse>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    // Get combined history
    const libraryRepo = getLibraryRepository();
    const history = await libraryRepo.getCombinedHistory(user.id, limit);

    return NextResponse.json(
      { history },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('History fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/library/history
 *
 * Clear all history for the current user
 */
export async function DELETE(): Promise<
  NextResponse<SuccessResponse | ErrorResponse>
> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Clear all history
    const libraryRepo = getLibraryRepository();
    await libraryRepo.clearAllHistory(user.id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Clear history error:', error);
    return NextResponse.json(
      { error: 'Failed to clear history' },
      { status: 500 }
    );
  }
}
