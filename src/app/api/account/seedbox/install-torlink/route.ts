import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  DEFAULT_FILES_PORT,
  DEFAULT_SERVE_PORT,
  loadAccountSeedboxConfig,
  provisionTorlink,
  saveAccountSeedboxConfig,
} from '@/lib/seedbox';

// One-click: install torlnk on the account's SSH-connected seedbox, start its
// add-API (serve) + file server (files) with a generated bearer token, open the
// firewall ports, and wire the resulting HTTP + files endpoints into the
// account's seedbox config. Requires an SSH connection to already be saved.

export const dynamic = 'force-dynamic';
// Global npm install + daemon startup can take a couple of minutes.
export const maxDuration = 300;

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const config = await loadAccountSeedboxConfig(user.id);
  if (!config?.ssh) {
    return NextResponse.json(
      { error: 'Add an SSH connection (host, user, private key) in Settings → Seedbox first, then install torlink.' },
      { status: 400 }
    );
  }

  const result = await provisionTorlink(config.ssh, {
    servePort: DEFAULT_SERVE_PORT,
    filesPort: DEFAULT_FILES_PORT,
  });

  if (!result.ok || !result.token) {
    return NextResponse.json(
      { error: 'Provisioning did not complete', steps: result.steps },
      { status: 502 }
    );
  }

  // Wire the freshly-provisioned endpoints into the account config (bearer token
  // for both the add-API and the file server). SSH stays as-is.
  const host = config.ssh.host;
  try {
    const summary = await saveAccountSeedboxConfig(user.id, {
      http: {
        baseUrl: `http://${host}:${result.servePort}`,
        token: result.token,
        addPath: '/add',
        auth: 'bearer',
        magnetField: 'magnet',
      },
      files: {
        baseUrl: `http://${host}:${result.filesPort}`,
        auth: 'bearer',
        token: result.token,
      },
    });
    return NextResponse.json({ success: true, steps: result.steps, summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Provisioned, but failed to save config: ${detail}`, steps: result.steps }, { status: 500 });
  }
}
