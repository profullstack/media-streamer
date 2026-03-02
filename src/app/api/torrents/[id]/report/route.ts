import { NextRequest, NextResponse } from 'next/server';
import { getEmailService } from '@/lib/email';

interface ReportTorrentBody {
  title?: string;
  reason?: string;
  to?: string;
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
    const reportTo = (body.to ?? process.env.REPORT_EMAIL_TO ?? 'support@bittorrented.com').trim();

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

    const payload = {
      from: `${process.env.EMAIL_FROM_NAME || 'BitTorrented'} <${process.env.EMAIL_FROM || 'noreply@bittorrented.com'}>`,
      to: reportTo,
      subject: `Report torrent: ${title}`,
      text: [
        'Please review this indexed torrent listing:',
        '',
        `Title: ${title}`,
        `Infohash: ${id}`,
        `Details: ${detailsUrl}`,
        `Reason: ${reason}`,
      ].join('\n'),
    };

    const { data, error } = await emailService.resend.emails.send(payload);

    if (error) {
      console.error('[Torrent Report] Resend send failed:', {
        error,
        payload: { ...payload, to: '[redacted]' },
      });
      return NextResponse.json({ error: 'Failed to submit report', provider: 'resend' }, { status: 502 });
    }

    console.log('[Torrent Report] Resend accepted message:', data?.id, 'to:', reportTo);
    return NextResponse.json({ success: true, provider: 'resend', to: reportTo, messageId: data?.id ?? null }, { status: 200 });
  } catch (error) {
    console.error('[Torrent Report] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
