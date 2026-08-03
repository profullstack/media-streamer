import { NextRequest, NextResponse } from 'next/server';
import { getActiveProfileId } from '@/lib/profiles';
import { importOpmlOutlines, parseOpmlFeeds } from '@/lib/rss-reader';

// Whole-directory OPML exports are big: Kagi's Small Web list is ~7 MB / 47k
// feeds. nginx accepts 100 MB bodies (scripts/setup-server.sh), so this cap is
// about bounding parser memory, not about rejecting real subscription lists.
const MAX_OPML_BYTES = 25_000_000;

function tooLargeMessage(): string {
  return `OPML file is too large (limit ${Math.round(MAX_OPML_BYTES / 1_000_000)} MB)`;
}

async function readOpmlFromRequest(request: NextRequest): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return null;
    if (file.size > MAX_OPML_BYTES) {
      throw new Error(tooLargeMessage());
    }
    return file.text();
  }

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as unknown;
    if (typeof body !== 'object' || body === null) return null;
    const opml = (body as Record<string, unknown>).opml;
    return typeof opml === 'string' ? opml : null;
  }

  const text = await request.text();
  return text.trim() ? text : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No profile selected' }, { status: 400 });
  }

  let opml: string | null;
  try {
    opml = await readOpmlFromRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid OPML upload';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!opml) {
    return NextResponse.json({ error: 'Missing OPML file or opml body' }, { status: 400 });
  }

  if (Buffer.byteLength(opml, 'utf8') > MAX_OPML_BYTES) {
    return NextResponse.json({ error: tooLargeMessage() }, { status: 400 });
  }

  // Parse once and hand the outlines to the importer; re-parsing a multi-MB
  // OPML just to count feeds doubles the peak memory of a large import.
  const outlines = parseOpmlFeeds(opml);
  if (outlines.length === 0) {
    return NextResponse.json({ error: 'No valid RSS feed URLs found in OPML' }, { status: 400 });
  }

  const result = await importOpmlOutlines(profileId, outlines);
  return NextResponse.json(result);
}
