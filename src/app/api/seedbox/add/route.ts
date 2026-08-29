/**
 * POST /api/seedbox/add — hand the seedbox a torrent by hand.
 *
 * Everything else that reaches a seedbox comes from the index: you find a
 * torrent on the site and press send. This is the other way in, for content the
 * index has never seen — your own release, something a friend sent you, a
 * .torrent file on your disk.
 *
 * Two shapes of input, one path out. A magnet goes straight through. A .torrent
 * is read for its infohash, name and announce list and turned into a magnet,
 * which is what every seedbox transport already speaks — so this adds a way in
 * without adding a second way to send.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  hasSeedbox,
  isValidMagnet,
  loadSeedboxForRequest,
  sendTorrentToSeedbox,
  type SeedboxTransport,
} from '@/lib/seedbox';
import { MAX_TORRENT_BYTES, magnetFor, readTorrent } from '@/lib/seedbox/torrent-file';

interface AddBody {
  magnet?: unknown;
  torrent?: unknown;
  name?: unknown;
  seedboxId?: unknown;
  transport?: unknown;
}

function isTransport(value: unknown): value is SeedboxTransport {
  return value === 'http' || value === 'ssh';
}

/**
 * The uploaded .torrent, as bytes.
 *
 * A data: URI prefix is stripped because that is what FileReader.readAsDataURL
 * hands the browser, and making the client remember to remove it is a bug
 * waiting to be written once per caller. Buffer.from ignores characters it
 * cannot decode rather than throwing, so the length check is what separates a
 * real upload from a pasted sentence.
 */
function decodeTorrent(value: unknown): Buffer | null {
  if (typeof value !== 'string') return null;
  const base64 = value.replace(/^data:[^,]*,/, '').trim();
  if (!base64) return null;
  // 4 base64 chars per 3 bytes; refuse before allocating rather than after.
  if (base64.length > Math.ceil((MAX_TORRENT_BYTES * 4) / 3)) return null;
  const bytes = Buffer.from(base64, 'base64');
  return bytes.length > 0 ? bytes : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AddBody;
  const seedboxId = typeof body.seedboxId === 'string' ? body.seedboxId : null;

  const config = await loadSeedboxForRequest(user.id, seedboxId);
  if (!hasSeedbox(config)) {
    return NextResponse.json(
      { error: 'No seedbox is connected. Add one in Seedboxes → Setup.' },
      { status: 403 }
    );
  }

  let magnet: string;
  let name = typeof body.name === 'string' ? body.name.trim() : '';

  const uploaded = decodeTorrent(body.torrent);
  if (uploaded) {
    const summary = readTorrent(uploaded);
    if (!summary) {
      return NextResponse.json(
        { error: "That file isn't a readable .torrent" },
        { status: 400 }
      );
    }
    magnet = magnetFor(summary);
    // The torrent's own name beats anything the form guessed from a filename.
    name = summary.name;
  } else if (isValidMagnet(body.magnet)) {
    magnet = body.magnet.trim();
  } else {
    return NextResponse.json(
      { error: 'Paste a magnet link, or choose a .torrent file' },
      { status: 400 }
    );
  }

  const transport = isTransport(body.transport) ? body.transport : undefined;
  const result = await sendTorrentToSeedbox(magnet, name, transport, config);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, transport: result.transport },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { success: true, transport: result.transport, message: result.message, name, magnet },
    { status: 200 }
  );
}
