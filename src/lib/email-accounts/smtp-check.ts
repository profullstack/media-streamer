import net from 'node:net';
import tls from 'node:tls';
import type { EmailAccount, SmtpCheckResult } from './types';
import { normalizeEmailAccountSmtp, validateSmtpPortSecurity } from './provider-settings';

const SMTP_TIMEOUT_MS = 15_000;

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
      reject(new Error('SMTP check timed out'));
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

export async function checkSmtpAccount(account: EmailAccount): Promise<SmtpCheckResult> {
  let socket: net.Socket | null = null;
  const effectiveAccount = normalizeEmailAccountSmtp(account);

  const configError = validateSmtpPortSecurity(effectiveAccount.smtpPort, effectiveAccount.smtpSecurity);
  if (configError) {
    return { success: false, error: configError };
  }

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
    await command(socket, 'QUIT', [221]);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SMTP check failed',
    };
  } finally {
    socket?.destroy();
  }
}
