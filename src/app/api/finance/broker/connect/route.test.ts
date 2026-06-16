/**
 * Tests for /api/finance/broker/connect — gating, validation, connect/disconnect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGate = vi.fn();
vi.mock('@/lib/subscription/guard', () => ({
  requireActiveSubscription: (req: NextRequest) => mockGate(req),
}));
vi.mock('@/lib/profiles/profile-utils', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-1'),
}));

const svc = vi.hoisted(() => ({
  connectBroker: vi.fn(),
  disconnectBroker: vi.fn(),
  listConnections: vi.fn(),
}));
vi.mock('@/lib/finance/brokers/service', () => svc);

import { GET, POST, DELETE } from './route';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/finance/broker/connect', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/finance/broker/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue(null);
  });

  it('blocks unpaid users', async () => {
    mockGate.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(post({ provider: 'alpaca', apiKey: 'a', apiSecret: 'b' }));
    expect(res.status).toBe(403);
    expect(svc.connectBroker).not.toHaveBeenCalled();
  });

  it('rejects an unsupported provider', async () => {
    const res = await POST(post({ provider: 'robinhood', apiKey: 'a', apiSecret: 'b' }));
    expect(res.status).toBe(400);
  });

  it('requires apiKey and apiSecret', async () => {
    const res = await POST(post({ provider: 'alpaca', apiKey: '', apiSecret: '' }));
    expect(res.status).toBe(400);
  });

  it('connects with valid input and never echoes secrets', async () => {
    svc.connectBroker.mockResolvedValueOnce({
      ok: true,
      connection: { id: 'c1', provider: 'alpaca', scope: 'read-only', status: 'active', label: 'Paper', lastSyncAt: null, lastSyncError: null },
    });
    const res = await POST(post({ provider: 'alpaca', apiKey: 'AK', apiSecret: 'SK', paper: true, label: 'Paper' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.connection.id).toBe('c1');
    expect(JSON.stringify(body)).not.toContain('SK');
    expect(svc.connectBroker).toHaveBeenCalledWith(
      'profile-1',
      'alpaca',
      { apiKey: 'AK', apiSecret: 'SK', paper: true },
      'Paper',
    );
  });

  it('surfaces a verification failure as 400', async () => {
    svc.connectBroker.mockResolvedValueOnce({ ok: false, error: 'bad creds' });
    const res = await POST(post({ provider: 'alpaca', apiKey: 'AK', apiSecret: 'SK' }));
    expect(res.status).toBe(400);
  });

  it('DELETE requires an id and disconnects', async () => {
    svc.disconnectBroker.mockResolvedValueOnce(true);
    const ok = await DELETE(new NextRequest('http://localhost/api/finance/broker/connect?id=c1', { method: 'DELETE' }));
    expect(ok.status).toBe(200);
    expect(svc.disconnectBroker).toHaveBeenCalledWith('profile-1', 'c1');

    const missing = await DELETE(new NextRequest('http://localhost/api/finance/broker/connect', { method: 'DELETE' }));
    expect(missing.status).toBe(400);
  });

  it('GET lists connections', async () => {
    svc.listConnections.mockResolvedValueOnce([{ id: 'c1', provider: 'alpaca' }]);
    const res = await GET(new NextRequest('http://localhost/api/finance/broker/connect'));
    const body = await res.json();
    expect(body.connections).toHaveLength(1);
    expect(body.supported).toContain('alpaca');
  });
});
