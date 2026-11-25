/**
 * Quick connect for a member's own box (src/lib/seedbox/quick-connect.ts).
 *
 * POST {host, user?, port?, name?} [?id=]  -> makes an SSH key for the box, stores the
 *   private half sealed with the rest of the seedbox config, and answers with the one
 *   line to paste on the box. Without `id` a new seedbox is created.
 * GET ?id=  -> tries the connection, and repeats the line to paste when it is refused.
 *
 * No password is ever asked for or sent here. Installing torlink afterwards is the
 * existing ../install-torlink route.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  createSeedbox,
  execRemote,
  getSeedboxConfigSummary,
  loadSeedboxForRequest,
  saveAccountSeedboxConfig,
} from '@/lib/seedbox';
import { getSeedboxPublicKey } from '@/lib/seedbox/ssh-transport';
import {
  authorizeCommand,
  cleanHost,
  cleanPort,
  cleanUser,
  explainSshFailure,
  generateSshKeyPair,
  loginCommand,
} from '@/lib/seedbox/quick-connect';
import { withVaultErrors } from '@/lib/vault/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The stored SSH config only counts as usable with a delivery mode set. Torrents are
 * handed to torlink's own add-API, so this directory is never read; it is what makes
 * the connection "ready" for the installer.
 */
const UNUSED_WATCH_DIR = '~/Downloads/watch';

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const host = cleanHost(body.host);
  const sshUser = cleanUser(body.user);
  const port = cleanPort(body.port);
  if (!host) return NextResponse.json({ error: 'Enter the IP address or hostname of your box.' }, { status: 400 });
  if (!sshUser) return NextResponse.json({ error: 'That user name is not valid. Most new boxes use root.' }, { status: 400 });
  if (!port) return NextResponse.json({ error: 'The SSH port must be a number from 1 to 65535.' }, { status: 400 });

  let pair;
  try {
    pair = await generateSshKeyPair();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: explainSshFailure(detail) }, { status: 500 });
  }

  const ssh = { host, port, user: sshUser, privateKey: pair.privateKey, watchDir: UNUSED_WATCH_DIR };
  const id = new URL(request.url).searchParams.get('id') ?? undefined;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : undefined;
  const summary = id
    ? await saveAccountSeedboxConfig(user.id, { ssh }, id)
    : await createSeedbox(user.id, { name, ssh });

  return NextResponse.json({
    success: true,
    id: summary.id,
    summary,
    publicKey: pair.publicKey,
    command: authorizeCommand(pair.publicKey),
    login: loginCommand(host, sshUser, port),
  });
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id') ?? undefined;
  const config = await loadSeedboxForRequest(user.id, id);
  if (!config?.ssh) {
    return NextResponse.json({ connected: false, error: 'Enter your box address first.' }, { status: 400 });
  }

  const summary = await getSeedboxConfigSummary(user.id, id);
  try {
    // Says who we are on the box and how much room there is: the two things worth
    // knowing before a seedbox is installed on it.
    const { stdout } = await execRemote(config.ssh, {
      command: `printf '%s|' "$(whoami)" "$(uname -sm)"; df -Pk "$HOME" | awk 'NR==2 {print $4}'`,
      timeoutMs: 25_000,
    });
    const [who = '', system = '', freeKb = ''] = stdout.trim().split('|');
    const freeGb = Number.isFinite(Number(freeKb)) ? Math.round(Number(freeKb) / 1024 / 1024) : null;
    return NextResponse.json({ connected: true, user: who, system, freeGb, summary });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const publicKey = await getSeedboxPublicKey(config.ssh);
    let command: string | null = null;
    try {
      command = publicKey ? authorizeCommand(publicKey.split(' ').slice(0, 2).join(' ') + ' bittorrented-seedbox') : null;
    } catch {
      command = null;
    }
    return NextResponse.json({
      connected: false,
      error: explainSshFailure(detail),
      command,
      login: loginCommand(config.ssh.host, config.ssh.user, config.ssh.port),
      summary,
    });
  }
}

export const POST = withVaultErrors(handlePOST);
export const GET = withVaultErrors(handleGET);
