/**
 * Supported Coins API Route
 *
 * Server-side endpoint to fetch supported cryptocurrencies from CoinPayPortal.
 * This keeps the API key secure on the server and provides a clean interface
 * for client components to fetch available payment options.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';
import type { SupportedCoinsResponse } from '@/lib/coinpayportal/types';

export interface SupportedCoinsErrorResponse {
  success: false;
  error: string;
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<SupportedCoinsResponse | SupportedCoinsErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active_only') === 'true';

    const client = getCoinPayPortalClient();
    const response = await client.getSupportedCoins({ activeOnly });

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to fetch supported coins:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch supported coins',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}
