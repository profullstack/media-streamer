import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  deleteAccountSeedboxConfig,
  getSeedboxConfigSummary,
  saveAccountSeedboxConfig,
  type SeedboxConfigInput,
} from '@/lib/seedbox';

// Per-account seedbox connection management. Configured once on the master
// account; shared to every profile under it. Secrets are encrypted at rest and
// NEVER returned — GET yields only a presence/summary view.

export const dynamic = 'force-dynamic';

/** GET — secret-free summary of the account's connected seedbox. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const summary = await getSeedboxConfigSummary(user.id);
    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

function asStringOrUndef(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asPortOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** PUT — upsert the connection. Blank/omitted secret fields keep their stored value. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const http = (body.http ?? {}) as Record<string, unknown>;
  const ssh = (body.ssh ?? {}) as Record<string, unknown>;
  const files = (body.files ?? {}) as Record<string, unknown>;

  const input: SeedboxConfigInput = {
    http: {
      baseUrl: asStringOrUndef(http.baseUrl),
      token: asStringOrUndef(http.token),
      addPath: asStringOrUndef(http.addPath),
      auth: asStringOrUndef(http.auth),
      magnetField: asStringOrUndef(http.magnetField),
    },
    ssh: {
      host: asStringOrUndef(ssh.host),
      port: asPortOrNull(ssh.port),
      user: asStringOrUndef(ssh.user),
      privateKey: asStringOrUndef(ssh.privateKey),
      watchDir: asStringOrUndef(ssh.watchDir),
      addCommand: asStringOrUndef(ssh.addCommand),
    },
    files: {
      baseUrl: asStringOrUndef(files.baseUrl),
      auth: asStringOrUndef(files.auth),
      token: asStringOrUndef(files.token),
      basicUser: asStringOrUndef(files.basicUser),
      basicPass: asStringOrUndef(files.basicPass),
    },
  };

  try {
    const summary = await saveAccountSeedboxConfig(user.id, input);
    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

/** DELETE — disconnect the account's seedbox entirely. */
export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    await deleteAccountSeedboxConfig(user.id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
