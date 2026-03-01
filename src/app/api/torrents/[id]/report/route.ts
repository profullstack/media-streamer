import { NextRequest, NextResponse } from 'next/server';
import { getEmailService } from '@/lib/email';

interface ReportTorrentBody {
  title?: string;
  reason?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'Torrent id is required' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as ReportTorrentBody;
    const title = (body.title ?? '').trim() || 'Unknown title';
    const reason = (body.reason ?? '').trim() || 'Not specified';

    const detailsUrl = `https://bittorrented.com/torrents/${id}`;

    let emailService;
    try {
      emailService = getEmailService();
    } catch (emailConfigError) {
      console.error('[Torrent Report] Email service unavailable:', emailConfigError);
      return NextResponse.json(
        { error: 'Report email service is not configured' },
        { status: 503 }
      );
    }

    const { data, error } = await emailService.resend.emails.send({
      from: `${process.env.EMAIL_FROM_NAME || 'BitTorrented'} <${process.env.EMAIL_FROM || 'noreply@bittorrented.com'}>`,
      to: 'support@bittorrented.com',
      subject: `Report torrent: ${title}`,
      text: [
        'Please review this indexed torrent listing:',
        '',
        `Title: ${title}`,
        `Infohash: ${id}`,
        `Details: ${detailsUrl}`,
        `Reason: ${reason}`,
      ].join('\n'),
    });

    if (error) {
      console.error('[Torrent Report] Failed to send report email:', error);
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 502 });
    }

    return NextResponse.json({ success: true, messageId: data?.id ?? null }, { status: 200 });
  } catch (error) {
    console.error('[Torrent Report] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
