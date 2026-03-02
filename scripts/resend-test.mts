import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY!);
const from = `${process.env.EMAIL_FROM_NAME || 'BitTorrented'} <${process.env.EMAIL_FROM || 'support@bittorrented.com'}>`;
const to = process.env.REPORT_EMAIL_TO || 'support@bittorrented.com';
const { data, error } = await resend.emails.send({
  from,
  to,
  subject: 'Resend test from ~/src/media-streamer',
  text: 'Testing RESEND from ~/src/media-streamer/.env',
});
console.log(JSON.stringify({ ok: !error, to, messageId: data?.id ?? null, error: error ?? null }, null, 2));
