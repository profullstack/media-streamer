/**
 * Pass payments (VOD, seedbox rental, IPTV resale pass) arrive at the ONE
 * business webhook, /api/webhooks/coinpayportal: CoinPay never delivers to
 * the per-kind routes. These post real-shaped, really signed (HMAC over
 * "t.rawBody") nested CoinPay payloads and check each kind reaches its grant,
 * flips it once, and that the old per-kind addresses forward to the same handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const { SECRET, handleWebhook, adoptSessionPayment, grants, earnings, byPayment, flip } = vi.hoisted(() => {
  type Grant = { id: string; status: string; paymentId: string; amountUsd: number };
  /** One grant per kind, in memory, behind each repository's webhook functions. */
  const grants: Record<string, Grant> = {};
  const earnings: Record<string, number> = { vod: 0, seedbox_share: 0, iptv_share: 0 };
  const byPayment = (paymentId: string) => {
    const g = Object.values(grants).find((one) => one.paymentId === paymentId);
    return g ? { ...g, coinpayportalPaymentId: g.paymentId, providerId: 'prov', shareId: 'share', grantKind: 'weekly', accessMode: 'stream' } : null;
  };
  const flip = (id: string): boolean => {
    const g = Object.values(grants).find((one) => one.id === id)!;
    if (g.status === 'paid' || g.status === 'refunded') return false;
    g.status = 'paid';
    return true;
  };
  return { SECRET: 'whsec_grant_routing_test', handleWebhook: vi.fn(), adoptSessionPayment: vi.fn(), grants, earnings, byPayment, flip };
});

vi.mock('@/lib/coinpayportal/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/coinpayportal/client')>('@/lib/coinpayportal/client');
  const client = new actual.CoinPayPortalClient({ apiKey: 'cp_live_test', businessId: 'biz', webhookSecret: SECRET });
  return { ...actual, getCoinPayPortalClient: () => client };
});

// The subscription path must never see a pass payment.
vi.mock('@/lib/coinpayportal/webhook-handler', () => ({ getWebhookHandler: () => ({ handleWebhook }) }));
vi.mock('@/lib/coinpayportal/session-payments', () => ({ adoptSessionPayment: (...a: unknown[]) => adoptSessionPayment(...a) }));
vi.mock('@/lib/argontv/webhook', () => ({ processIptvWebhook: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ getServerClient: vi.fn(() => ({})) }));

vi.mock('@/lib/vod/repository', () => ({
  getGrantByPaymentId: async (p: string) => byPayment(p),
  getProviderById: async () => ({ passWindowMinutes: 10080 }),
  markGrantPaid: async (id: string) => flip(id),
  markGrantStatus: async (id: string, status: string) => { Object.values(grants).find((g) => g.id === id)!.status = status; },
  incrementProviderEarnings: async (_: string, usd: number) => { earnings.vod += usd; },
}));
vi.mock('@/lib/seedbox/shares/repository', () => ({
  getGrantByPaymentId: async (p: string) => byPayment(p),
  getShareById: async () => ({ passWindowMinutes: 1440 }),
  markGrantPaid: async (id: string) => flip(id),
  markGrantStatus: async (id: string, status: string) => { Object.values(grants).find((g) => g.id === id)!.status = status; },
  incrementShareEarnings: async (_: string, usd: number) => { earnings.seedbox_share += usd; },
}));
vi.mock('@/lib/iptv/shares/repository', () => ({
  getGrantByPaymentId: async (p: string) => byPayment(p),
  getShareById: async () => ({ passWindowMinutes: 240 }),
  markGrantPaid: async (id: string) => (flip(id) ? { id } : null),
  markGrantStatus: async (id: string, status: string) => { Object.values(grants).find((g) => g.id === id)!.status = status; },
  bumpShareCounters: async (_: string, c: { earningsUsd: number }) => { earnings.iptv_share += c.earningsUsd; },
}));

import { POST } from './route';
import { POST as VOD_POST } from './vod/route';
import { POST as SHARE_POST } from './share/route';
import { POST as IPTV_SHARE_POST } from './iptv-share/route';

const KINDS = [
  { kind: 'vod', payment: '0b7f3c1e-1111-4a2b-9c3d-000000000001', grant: 'g-vod', extra: { providerId: 'prov' } },
  { kind: 'seedbox_share', payment: '0b7f3c1e-2222-4a2b-9c3d-000000000002', grant: 'g-seedbox', extra: { shareId: 'share' } },
  { kind: 'iptv_share', payment: '0b7f3c1e-3333-4a2b-9c3d-000000000003', grant: 'g-iptv', extra: { shareId: 'share' } },
] as const;

/** The body CoinPay's sendPaymentWebhook signs: nested under data, top-level id is the event. */
function coinpayBody(type: string, paymentId: string, metadata: Record<string, string>) {
  const ts = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    id: `evt_${paymentId}_${ts}`,
    type,
    data: {
      payment_id: paymentId,
      status: type.split('.')[1],
      amount: 5,
      amount_usd: '5.00',
      amount_crypto: '5.000000',
      currency: 'USDC_POL',
      tx_hash: '0xabc',
      metadata,
    },
    created_at: new Date().toISOString(),
    business_id: '00000000-0000-4000-8000-00000000b170',
  });
}

function signed(url: string, raw: string, secret = SECRET): NextRequest {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-coinpay-signature': `t=${t},v1=${v1}` }, body: raw });
}

const MAIN = 'https://bittorrented.com/api/webhooks/coinpayportal';

describe('pass payments through the one CoinPay webhook', () => {
  beforeEach(() => {
    handleWebhook.mockReset();
    adoptSessionPayment.mockReset();
    for (const k of KINDS) grants[k.kind] = { id: k.grant, status: 'pending', paymentId: k.payment, amountUsd: 5 };
    for (const key of Object.keys(earnings)) earnings[key] = 0;
  });

  for (const k of KINDS) {
    it(`${k.kind}: confirmed pays the grant once; forwarded and a redelivery are no-ops`, async () => {
      const meta = { type: k.kind, grantId: k.grant, ...k.extra };
      const confirmed = await POST(signed(MAIN, coinpayBody('payment.confirmed', k.payment, meta)));
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toMatchObject({ success: true, kind: k.kind, action: 'paid', grantId: k.grant });
      expect(grants[k.kind]!.status).toBe('paid');

      const forwarded = await POST(signed(MAIN, coinpayBody('payment.forwarded', k.payment, meta)));
      expect(await forwarded.json()).toMatchObject({ success: true, action: 'already_paid' });
      const again = await POST(signed(MAIN, coinpayBody('payment.confirmed', k.payment, meta)));
      expect(await again.json()).toMatchObject({ success: true, action: 'already_paid' });

      expect(earnings[k.kind]).toBe(5);
      expect(handleWebhook).not.toHaveBeenCalled();
      expect(adoptSessionPayment).not.toHaveBeenCalled();
    });

    it(`${k.kind}: expired marks a pending grant expired`, async () => {
      const res = await POST(signed(MAIN, coinpayBody('payment.expired', k.payment, { type: k.kind, grantId: k.grant })));
      expect(await res.json()).toMatchObject({ success: true, action: 'expired' });
      expect(grants[k.kind]!.status).toBe('expired');
    });

    it(`${k.kind}: an unknown payment is a 200 no-op (nothing to retry)`, async () => {
      const res = await POST(signed(MAIN, coinpayBody('payment.confirmed', '0b7f3c1e-9999-4a2b-9c3d-999999999999', { type: k.kind })));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: false, kind: k.kind, action: 'ignored:grant_not_found' });
      expect(earnings[k.kind]).toBe(0);
    });
  }

  it('refuses a bad signature before touching any grant', async () => {
    const raw = coinpayBody('payment.confirmed', KINDS[0].payment, { type: 'vod', grantId: 'g-vod' });
    const res = await POST(signed(MAIN, raw, 'not-the-secret'));
    expect(res.status).toBe(401);
    expect(grants.vod!.status).toBe('pending');
  });

  it('the old per-kind addresses forward to the same verified handler', async () => {
    const routes = [VOD_POST, SHARE_POST, IPTV_SHARE_POST];
    for (const [at, k] of KINDS.entries()) {
      const url = `${MAIN}/${['vod', 'share', 'iptv-share'][at]}`;
      const raw = coinpayBody('payment.confirmed', k.payment, { type: k.kind, grantId: k.grant });
      expect((await routes[at]!(signed(url, raw, 'wrong'))).status).toBe(401);
      const res = await routes[at]!(signed(url, raw));
      expect(await res.json()).toMatchObject({ success: true, kind: k.kind, action: 'paid' });
    }
  });

  it('a payment without a pass kind still goes to the subscription handler', async () => {
    adoptSessionPayment.mockResolvedValue({ table: null, rekeyed: false, abandonedAttempt: false });
    handleWebhook.mockResolvedValue({ success: true, action: 'payment_confirmed', paymentId: 'p', userId: 'u' });
    const res = await POST(signed(MAIN, coinpayBody('payment.confirmed', '0b7f3c1e-4444-4a2b-9c3d-000000000004', { type: 'subscription', user_id: 'u' })));
    expect(res.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledTimes(1);
  });
});
