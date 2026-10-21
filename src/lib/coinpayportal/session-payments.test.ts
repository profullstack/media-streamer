/**
 * Hosted checkout sessions: the session body CoinPay gets, and how a session's
 * webhook finds and settles the order it belongs to.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { CoinPayPortalClient, checkoutSessionBody, paymentProperty } from './client';
import { adoptSessionPayment } from './session-payments';
import { handleIptvWebhook } from '@/lib/argontv/webhook';
import type { WebhookPayload } from './types';

const SESSION = 'cs_AbCdEfGhIjKlMnOpQrStUvWx';

/** Just enough of the Supabase query builder for adoptSessionPayment, over in-memory tables. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    const builder = {
      select: () => builder,
      update: (p: Record<string, unknown>) => {
        patch = p;
        return builder;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return builder;
      },
      maybeSingle: async () => {
        const found = match()[0] ?? null;
        if (found && patch) Object.assign(found, patch);
        return { data: found ? { id: found.id } : null, error: null };
      },
    };
    return builder;
  };
  return { from } as never;
}

const event = (type: WebhookPayload['type'], data: Partial<WebhookPayload['data']> = {}) => ({
  type,
  data: { payment_id: 'pay-1', currency: 'USDC_POL', checkout_session_id: SESSION, ...data },
});

describe('checkout session body', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sends amount, USD, buyer email + account id, the site hostname and the return URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.bittorrented.com');
    expect(
      checkoutSessionBody({
        amount: 4.99,
        description: 'BitTorrented premium subscription',
        customerEmail: 'a@b.co',
        accountId: 'user-1',
        metadata: { orderId: 'o1' },
        successUrl: 'https://bittorrented.com/account?payment=success',
        cancelUrl: 'https://bittorrented.com/pricing',
      })
    ).toEqual({
      amount: 4.99,
      currency: 'USD',
      description: 'BitTorrented premium subscription',
      customer_email: 'a@b.co',
      account_id: 'user-1',
      property: 'bittorrented.com',
      metadata: { orderId: 'o1' },
      success_url: 'https://bittorrented.com/account?payment=success',
      cancel_url: 'https://bittorrented.com/pricing',
      expires_in_minutes: 60,
    });
  });

  it('never files a sale under localhost', () => {
    expect(paymentProperty('http://localhost:3000')).toBe('bittorrented.com');
    expect(paymentProperty(undefined)).toBe('bittorrented.com');
  });

  it('POSTs to /api/checkout/sessions with the business key and only follows a CoinPay URL', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: true, id: SESSION, url: `https://coinpayportal.com/checkout/${SESSION}` }, { status: 201 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinPayPortalClient({ apiKey: 'cp_live_x', businessId: 'b', webhookSecret: 's' });
    const created = await client.createCheckoutSession({
      amount: 1, description: 'd', customerEmail: 'a@b.co', accountId: 'u', metadata: {}, successUrl: 'https://x.y/', cancelUrl: 'https://x.y/',
    });
    expect(created).toEqual({ id: SESSION, url: `https://coinpayportal.com/checkout/${SESSION}` });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://coinpayportal.com/api/checkout/sessions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cp_live_x');

    fetchMock.mockResolvedValueOnce(Response.json({ success: true, id: SESSION, url: 'https://evil.example/checkout' }, { status: 201 }));
    await expect(
      client.createCheckoutSession({ amount: 1, description: 'd', customerEmail: 'a@b.co', accountId: 'u', metadata: {}, successUrl: 'https://x.y/', cancelUrl: 'https://x.y/' })
    ).rejects.toThrow(/not on CoinPay/);
    vi.unstubAllGlobals();
  });
});

describe('adoptSessionPayment', () => {
  it('re-keys the session row to the payment id on the payment confirming', async () => {
    const tables = { payment_history: [{ id: 'row-1', coinpayportal_payment_id: SESSION }], iptv_payment_history: [] };
    const result = await adoptSessionPayment(fakeDb(tables), event('payment.confirmed'));
    expect(result).toEqual({ table: 'payment_history', rekeyed: true, abandonedAttempt: false });
    expect(tables.payment_history[0]).toMatchObject({ coinpayportal_payment_id: 'pay-1', blockchain: 'USDC_POL' });
    // A second delivery (forwarded) finds it by payment id and re-keys nothing.
    expect(await adoptSessionPayment(fakeDb(tables), event('payment.forwarded'))).toEqual({ table: 'payment_history', rekeyed: false, abandonedAttempt: false });
  });

  it('finds an IPTV session row too', async () => {
    const tables = { payment_history: [], iptv_payment_history: [{ id: 'iptv-1', coinpayportal_payment_id: SESSION }] };
    expect((await adoptSessionPayment(fakeDb(tables), event('payment.detected'))).table).toBe('iptv_payment_history');
  });

  it('lets an abandoned attempt expire without claiming the session row', async () => {
    const tables = { payment_history: [{ id: 'row-1', coinpayportal_payment_id: SESSION }], iptv_payment_history: [] };
    expect(await adoptSessionPayment(fakeDb(tables), event('payment.expired'))).toEqual({ table: null, rekeyed: false, abandonedAttempt: true });
    expect(tables.payment_history[0]!.coinpayportal_payment_id).toBe(SESSION);
  });

  it('leaves an older one-coin payment alone and ignores a forged session id shape', async () => {
    const tables = { payment_history: [{ id: 'row-1', coinpayportal_payment_id: 'pay-1' }], iptv_payment_history: [] };
    expect(await adoptSessionPayment(fakeDb(tables), event('payment.confirmed', { checkout_session_id: undefined }))).toEqual({ table: 'payment_history', rekeyed: false, abandonedAttempt: false });
    expect(await adoptSessionPayment(fakeDb({}), event('payment.confirmed', { payment_id: 'x', checkout_session_id: 'not-a-session' }))).toEqual({ table: null, rekeyed: false, abandonedAttempt: false });
  });
});

describe('IPTV webhook fulfilment', () => {
  const payload = (type: WebhookPayload['type']): WebhookPayload => ({
    id: 'evt_1', type, created_at: '', business_id: '',
    data: { payment_id: 'pay-1', amount_crypto: '1', amount_usd: '14.99', currency: 'USDC_POL', status: 'confirmed' },
  });

  it('extends the line once: confirmed fulfils, forwarded after it is acknowledged only', async () => {
    const row: { id: string; metadata: Record<string, unknown> } = { id: 'iptv-1', metadata: { templateId: 7 } };
    const repository = {
      getPaymentByExternalId: vi.fn(async () => ({ ...row })),
      updatePaymentStatus: vi.fn(async () => row),
    };
    const service = { processPaymentCompletion: vi.fn(async () => ({ action: 'subscription_created', subscription: { id: 'sub-1' } })) };
    const mark = vi.fn(async (_id: string, metadata: Record<string, unknown>) => {
      row.metadata = metadata;
    });
    const first = await handleIptvWebhook(payload('payment.confirmed'), repository as never, service as never, mark);
    expect(first).toEqual({ status: 200, body: { success: true, action: 'subscription_created', paymentId: 'pay-1', subscriptionId: 'sub-1' } });
    expect(row.metadata).toMatchObject({ templateId: 7, fulfilledBy: 'payment.confirmed' });
    const second = await handleIptvWebhook(payload('payment.forwarded'), repository as never, service as never, mark);
    expect(second.body.action).toBe('already_fulfilled');
    expect(service.processPaymentCompletion).toHaveBeenCalledTimes(1);
  });

  it('answers 404 for a payment it does not know', async () => {
    const repository = { getPaymentByExternalId: vi.fn(async () => null) };
    const result = await handleIptvWebhook(payload('payment.confirmed'), repository as never, {} as never, vi.fn());
    expect(result.status).toBe(404);
  });
});

describe('IPTV webhook route', () => {
  it('refuses an unsigned body', async () => {
    vi.stubEnv('COINPAYPORTAL_API_KEY', 'cp_live_x');
    vi.stubEnv('NEXT_PUBLIC_COINPAYPORTAL_MERCHANT_ID', 'b');
    vi.stubEnv('COINPAYPORTAL_WEBHOOK_SECRET', 'whsec');
    const { resetCoinPayPortalClient } = await import('./client');
    resetCoinPayPortalClient();
    const { POST } = await import('@/app/api/iptv/subscription/webhook/route');
    const { NextRequest } = await import('next/server');
    const body = JSON.stringify(payload());
    const unsigned = await POST(new NextRequest('http://localhost/api/iptv/subscription/webhook', { method: 'POST', body }));
    expect(unsigned.status).toBe(401);
    const t = Math.floor(Date.now() / 1000);
    const forged = `t=${t},v1=${crypto.createHmac('sha256', 'wrong').update(`${t}.${body}`).digest('hex')}`;
    const bad = await POST(new NextRequest('http://localhost/api/iptv/subscription/webhook', { method: 'POST', body, headers: { 'x-coinpay-signature': forged } }));
    expect(bad.status).toBe(401);
    resetCoinPayPortalClient();
    vi.unstubAllEnvs();
  });

  function payload(): WebhookPayload {
    return { id: 'evt_1', type: 'payment.confirmed', created_at: '', business_id: '', data: { payment_id: 'pay-1', amount_crypto: '1', amount_usd: '1', currency: 'BTC', status: 'confirmed' } };
  }
});
