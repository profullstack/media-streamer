/**
 * Mint, list and revoke Premium-days credit codes from a terminal (same tables as
 * /api/admin/credit-codes; src/lib/rewards.ts).
 *
 *   pnpm credits mint --days 30 [--max 1] [--label "for Sam"] [--expires 2026-12-31]
 *   pnpm credits list
 *   pnpm credits revoke <codeId>
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the script loads .env; on dev2 run it with
 * --env-file=~/www/bittorrented.com/app.env). The plaintext code is printed once and never stored.
 */

import { createClient } from '@supabase/supabase-js';
import { Credits, supabaseStore } from '@profullstack/redeem-credits';

const env = (name: string) => process.env[name] ?? '';

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const credits = new Credits(supabaseStore(client as any), {
    // Grants happen at redemption in the app; minting from here never grants.
    onGrant: () => {
      throw new Error('credit-codes.ts does not grant');
    },
  });

  if (command === 'mint') {
    const days = Number(arg(args, 'days'));
    if (!Number.isInteger(days) || days < 1 || days > 3660) throw new Error('--days must be 1 to 3660');
    const expires = arg(args, 'expires');
    const minted = await credits.mint({
      grant: { unit: 'premium_days', amount: days },
      label: arg(args, 'label') ?? '',
      maxRedemptions: Number(arg(args, 'max') ?? 1),
      expiresAt: expires ? Date.parse(expires) : null,
      prefix: 'BT',
      createdBy: 'cli',
    });
    console.log(JSON.stringify(minted, null, 2));
  } else if (command === 'list') {
    console.log(JSON.stringify(await credits.list(), null, 2));
  } else if (command === 'revoke' && args[0]) {
    await credits.revoke(args[0]);
    console.log('revoked', args[0]);
  } else {
    console.error('usage: credit-codes mint --days N [--max N] [--label T] [--expires DATE] | list | revoke <id>');
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
