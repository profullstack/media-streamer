#!/usr/bin/env -S node --import tsx

/**
 * SiriusXM email-OTP login. Walks the 6-step flow and writes
 * SIRIUSXM_TOKEN + SIRIUSXM_SESSION_COOKIES to .env.
 *
 * Usage: ./bin/sxm-login.ts --email you@example.com [--debug]
 */

import { emailOtpLogin, loadDeviceGrantFromEnv, updateDotenv } from './sxm-auth';

interface Args {
  email: string;
  debug: boolean;
}

function parseArgs(argv: string[]): Args {
  let email = '';
  let debug = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' || a === '-e') email = argv[++i] ?? '';
    else if (a === '--debug') debug = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: ./bin/sxm-login.ts --email you@example.com [--debug]');
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  if (!email) {
    console.error('Missing --email');
    process.exit(1);
  }
  return { email, debug };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const deviceGrant = loadDeviceGrantFromEnv();

  const session = await emailOtpLogin(args.email, deviceGrant, { debug: args.debug });

  const updates: Record<string, string> = {
    SIRIUSXM_TOKEN: session.accessToken,
    SIRIUSXM_SESSION_COOKIES: session.cookies,
  };
  updateDotenv(updates);

  console.log('');
  console.log('wrote SIRIUSXM_TOKEN + SIRIUSXM_SESSION_COOKIES to .env');
  if (session.accessTokenExpiresAt) {
    console.log(`accessToken expires at ${session.accessTokenExpiresAt}`);
  }
  if (session.refreshTokenExpiresAt) {
    console.log(`refresh window ends at ${session.refreshTokenExpiresAt}`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
