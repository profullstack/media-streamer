/**
 * Supported Coins API Route Tests
 *
 * Tests for the supported coins API endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock the coinpayportal client
vi.mock('@/lib/coinpayportal/client', () => ({
  getCoinPayPortalClient: vi.fn(),
}));

import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';

const mockGetCoinPayPortalClient = vi.mocked(getCoinPayPortalClient);

describe('GET /api/supported-coins', () => {
  const mockClient = {
    getSupportedCoins: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCoinPayPortalClient.mockReturnValue(mockClient as unknown as ReturnType<typeof getCoinPayPortalClient>);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return supported coins successfully', async () => {
    const mockCoins = {
      success: true,
      coins: [
        { symbol: 'BTC', name: 'Bitcoin', is_active: true, has_wallet: true },
        { symbol: 'ETH', name: 'Ethereum', is_active: true, has_wallet: true },
        { symbol: 'SOL', name: 'Solana', is_active: false, has_wallet: true },
      ],
      business_id: 'test-business-id',
      total: 3,
    };

    mockClient.getSupportedCoins.mockResolvedValueOnce(mockCoins);

    const request = new NextRequest('http://localhost:3000/api/supported-coins');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.coins).toHaveLength(3);
    expect(data.coins[0].symbol).toBe('BTC');
    expect(mockClient.getSupportedCoins).toHaveBeenCalledWith({ activeOnly: false });
  });

  it('should filter active coins only when active_only query param is true', async () => {
    const mockCoins = {
      success: true,
      coins: [
        { symbol: 'BTC', name: 'Bitcoin', is_active: true, has_wallet: true },
        { symbol: 'ETH', name: 'Ethereum', is_active: true, has_wallet: true },
      ],
      business_id: 'test-business-id',
      total: 2,
    };

    mockClient.getSupportedCoins.mockResolvedValueOnce(mockCoins);

    const request = new NextRequest('http://localhost:3000/api/supported-coins?active_only=true');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockClient.getSupportedCoins).toHaveBeenCalledWith({ activeOnly: true });
  });

  it('should return 500 on API error', async () => {
    mockClient.getSupportedCoins.mockRejectedValueOnce(new Error('API error'));

    const request = new NextRequest('http://localhost:3000/api/supported-coins');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch supported coins');
  });

  it('should return 500 when client is not configured', async () => {
    mockGetCoinPayPortalClient.mockImplementationOnce(() => {
      throw new Error('Missing CoinPayPortal configuration');
    });

    const request = new NextRequest('http://localhost:3000/api/supported-coins');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch supported coins');
  });

  it('should handle empty coins list', async () => {
    const mockCoins = {
      success: true,
      coins: [],
      business_id: 'test-business-id',
      total: 0,
    };

    mockClient.getSupportedCoins.mockResolvedValueOnce(mockCoins);

    const request = new NextRequest('http://localhost:3000/api/supported-coins');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.coins).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('should set no-cache headers', async () => {
    const mockCoins = {
      success: true,
      coins: [],
      business_id: 'test-business-id',
      total: 0,
    };

    mockClient.getSupportedCoins.mockResolvedValueOnce(mockCoins);

    const request = new NextRequest('http://localhost:3000/api/supported-coins');
    const response = await GET(request);

    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
  });
});
