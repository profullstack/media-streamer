import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  decryptOptional,
  decryptSecret,
  encryptOptional,
  encryptSecret,
  isEncryptedSecret,
} from './crypto';

describe('seedbox crypto', () => {
  const original = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-seedbox-encryption-key-0123456789';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  });

  it('round-trips a secret and tags it with the envelope prefix', () => {
    const secret = 'super-secret-token-☃';
    const enc = encryptSecret(secret);
    expect(enc.startsWith('senc:v1:')).toBe(true);
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces a distinct ciphertext each time (random IV)', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const enc = encryptSecret('hello');
    const tampered = `${enc}00`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects a non-envelope value', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow(/Invalid encrypted/);
    expect(isEncryptedSecret('plain')).toBe(false);
  });

  it('encryptOptional/decryptOptional pass through null and empty', () => {
    expect(encryptOptional(null)).toBeNull();
    expect(encryptOptional('   ')).toBeNull();
    expect(decryptOptional(null)).toBeNull();
    expect(decryptOptional('')).toBeNull();
    const enc = encryptOptional('  padded  ');
    expect(enc).not.toBeNull();
    expect(decryptOptional(enc)).toBe('padded');
  });

  it('throws when ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCYRPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(/ENCRYPTION_KEY is required/);
  });
});
