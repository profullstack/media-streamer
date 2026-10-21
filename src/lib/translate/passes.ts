/**
 * Paid translated audio, the same offer as nixamp.com (@profullstack/live-translate):
 * 10 free sessions per account per day, then prepaid CoinPay passes (Day $1,
 * Month $5) spent at 5x provider cost. The package owns its tables
 * (translation_wallets/orders/usage, upgrade_daily_uses) in the app database.
 */
import { Pool } from 'pg';
import { TranslationPasses, type Queryable } from '@profullstack/live-translate';

const SITE = 'https://bittorrented.com';
/** Where a buyer may be sent back to: a VOD storefront. */
export const RETURN_PATH = /^\/vod\/[\w-]{1,80}$/;

let pool: Pool | null = null;

function db(): Queryable {
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL ?? '');
    // The self-hosted Supabase Postgres has a self-signed certificate.
    url.searchParams.delete('sslmode');
    pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 4 });
  }
  return pool;
}

const site = (): string => (process.env.APP_URL || SITE).replace(/\/+$/, '');

function make(returnTo?: string): TranslationPasses {
  return new TranslationPasses({
    db: db(),
    key: process.env.COINPAYPORTAL_API_KEY ?? '',
    site: site(),
    app: 'bittorrented',
    label: 'BitTorrented translated audio',
    property: 'bittorrented.com',
    redirect: (order) => `${site()}${returnTo && RETURN_PATH.test(returnTo) ? returnTo : '/vod'}?translation_order=${order}`,
  });
}

let passes: TranslationPasses | null = null;

export function translationAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPasses(): TranslationPasses {
  passes ??= make();
  return passes;
}

/** A checkout that sends the buyer back to the storefront they bought from. */
export function passesReturningTo(returnTo: string): TranslationPasses {
  return make(returnTo);
}

/** Whether a CoinPay webhook is one of ours, so it is settled here. */
export function isTranslationPayment(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.app === 'bittorrented' && metadata?.product === 'translation';
}
