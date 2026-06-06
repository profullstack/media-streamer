import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:v1';
const IV_BYTES = 12;
const KEY_ENV = 'EMAIL_ACCOUNTS_ENCRYPTION_KEY';

function getEncryptionKey(): Buffer {
  const secret = process.env[KEY_ENV];
  if (!secret) {
    throw new Error(`${KEY_ENV} is required to store SMTP credentials`);
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptCredential(value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function encryptNullableCredential(value: string | null | undefined): string | null {
  return value ? encryptCredential(value) : null;
}

export function decryptCredential(value: string): string {
  if (!value.startsWith(`${ENCRYPTED_PREFIX}:`)) return value;

  const [, , ivPart, tagPart, ciphertextPart] = value.split(':');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Invalid encrypted SMTP credential format');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivPart, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    throw new Error('Failed to decrypt SMTP credential', { cause: error });
  }
}

export function decryptNullableCredential(value: string | null): string | null {
  return value ? decryptCredential(value) : null;
}
