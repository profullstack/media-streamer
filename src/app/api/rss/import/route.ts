import { NextRequest, NextResponse } from 'next/server';
import { getActiveProfileId } from '@/lib/profiles';
import { importOpmlFeeds, parseOpmlFeeds } from '@/lib/rss-reader';

const MAX_OPML_BYTES = 1_000_000;

async function readOpmlFromRequest(request: NextRequest): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return null;
    if (file.size > MAX_OPML_BYTES) {
      throw new Error('OPML file is too large');
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

  if (opml.length > MAX_OPML_BYTES) {
    return NextResponse.json({ error: 'OPML file is too large' }, { status: 400 });
  }

  const outlines = parseOpmlFeeds(opml);
  if (outlines.length === 0) {
    return NextResponse.json({ error: 'No valid RSS feed URLs found in OPML' }, { status: 400 });
  }

  const result = await importOpmlFeeds(profileId, opml);
  return NextResponse.json(result);
}
