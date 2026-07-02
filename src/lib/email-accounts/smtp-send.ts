import net from 'node:net';
import { randomUUID } from 'node:crypto';
import tls from 'node:tls';
import type { EmailAccount } from './types';
import { normalizeEmailAccountSmtp, validateSmtpPortSecurity } from './provider-settings';

const SMTP_TIMEOUT_MS = 20_000;

export interface OutboundEmail {
  to: string[];
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
}

export interface SendEmailResult {
  messageId: string;
}

function readLine(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('SMTP send timed out'));
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('timeout', onTimeout);
  });
}

async function command(socket: net.Socket, line: string, expected: number[]): Promise<string> {
  socket.write(`${line}\r\n`);
  const response = await readLine(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new Error(`SMTP command failed: ${response.split(/\r?\n/)[0] ?? code}`);
  }
  return response;
}

function connectPlain(account: EmailAccount): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(account.smtpPort, account.smtpHost);
    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('SMTP connection timed out')));
  });
}

function connectTls(account: EmailAccount): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: account.smtpHost,
      port: account.smtpPort,
      servername: account.smtpHost,
      timeout: SMTP_TIMEOUT_MS,
    });
    socket.once('secureConnect', () => resolve(socket));
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('SMTP TLS connection timed out')));
  });
}

function upgradeToTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      socket,
      servername: host,
    });
    tlsSocket.setTimeout(SMTP_TIMEOUT_MS);
    tlsSocket.once('secureConnect', () => resolve(tlsSocket));
    tlsSocket.once('error', reject);
    tlsSocket.once('timeout', () => reject(new Error('SMTP STARTTLS timed out')));
  });
}

async function authenticate(socket: net.Socket, account: EmailAccount): Promise<void> {
  if (!account.smtpUsername) return;

  await command(socket, 'AUTH LOGIN', [334]);
  await command(socket, Buffer.from(account.smtpUsername).toString('base64'), [334]);
  await command(socket, Buffer.from(account.smtpPassword).toString('base64'), [235]);
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function formatMailbox(email: string, name: string | null): string {
  const cleanEmail = sanitizeHeader(email);
  if (!name?.trim()) return cleanEmail;
  const cleanName = sanitizeHeader(name).replace(/"/g, '\\"');
  return `"${cleanName}" <${cleanEmail}>`;
}

function normalizeRecipients(values: string[]): string[] {
  const recipients = values
    .map((value) => value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(recipients));
}

function escapeData(value: string): string {
  return value
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => line.startsWith('.') ? `.${line}` : line)
    .join('\r\n');
}

function makeMessageId(account: EmailAccount): string {
  const domain = account.fromEmail.split('@')[1] ?? 'bittorrented.local';
  return `<${Date.now()}.${randomUUID()}@${domain}>`;
}

function buildMessage(account: EmailAccount, input: OutboundEmail, messageId: string): string {
  const headers = [
    `From: ${formatMailbox(account.fromEmail, account.fromName)}`,
    `To: ${normalizeRecipients(input.to).join(', ')}`,
    `Subject: ${sanitizeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
  ];

  if (account.replyToEmail) headers.push(`Reply-To: ${sanitizeHeader(account.replyToEmail)}`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeader(input.inReplyTo)}`);
  if (input.references?.length) {
    headers.push(`References: ${input.references.map(sanitizeHeader).join(' ')}`);
  }

  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset=UTF-8');

  return `${headers.join('\r\n')}\r\n\r\n${escapeData(input.text.trim())}\r\n`;
}

export async function sendEmail(account: EmailAccount, input: OutboundEmail): Promise<SendEmailResult> {
  const effectiveAccount = normalizeEmailAccountSmtp(account);

  const configError = validateSmtpPortSecurity(effectiveAccount.smtpPort, effectiveAccount.smtpSecurity);
  if (configError) {
    throw new Error(configError);
  }

  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    throw new Error('No valid reply recipient');
  }

  if (!input.text.trim()) {
    throw new Error('Reply body is required');
  }

  let socket: net.Socket | null = null;
  const messageId = makeMessageId(effectiveAccount);

  try {
    socket = effectiveAccount.smtpSecurity === 'tls'
      ? await connectTls(effectiveAccount)
      : await connectPlain(effectiveAccount);

    await readLine(socket);
    await command(socket, 'EHLO bittorrented.local', [250]);

    if (effectiveAccount.smtpSecurity === 'starttls') {
      await command(socket, 'STARTTLS', [220]);
      socket = await upgradeToTls(socket, effectiveAccount.smtpHost);
      await command(socket, 'EHLO bittorrented.local', [250]);
    }

    await authenticate(socket, effectiveAccount);
    await command(socket, `MAIL FROM:<${effectiveAccount.fromEmail}>`, [250]);
    for (const recipient of recipients) {
      await command(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await command(socket, 'DATA', [354]);
    socket.write(`${buildMessage(effectiveAccount, { ...input, to: recipients }, messageId)}.\r\n`);
    const dataResponse = await readLine(socket);
    const dataCode = Number(dataResponse.slice(0, 3));
    if (dataCode !== 250) {
      throw new Error(`SMTP message was not accepted: ${dataResponse.split(/\r?\n/)[0] ?? dataCode}`);
    }
    await command(socket, 'QUIT', [221]);

    return { messageId };
  } finally {
    socket?.destroy();
  }
}
