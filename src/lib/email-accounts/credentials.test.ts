import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decryptCredential,
  decryptNullableCredential,
  encryptCredential,
  encryptNullableCredential,
} from './credentials';

describe('SMTP credential encryption', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encrypts and decrypts credentials', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key');

    const encrypted = encryptCredential('smtp-secret');

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('smtp-secret');
    expect(decryptCredential(encrypted)).toBe('smtp-secret');
  });

  it('encrypts nullable credentials', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key');

    const encrypted = encryptNullableCredential('me@example.com');

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptNullableCredential(encrypted)).toBe('me@example.com');
    expect(encryptNullableCredential(null)).toBeNull();
    expect(decryptNullableCredential(null)).toBeNull();
  });

  it('keeps plaintext values readable for existing rows', () => {
    expect(decryptCredential('legacy-password')).toBe('legacy-password');
    expect(decryptNullableCredential('legacy-username')).toBe('legacy-username');
  });

  it('can read the legacy key name during rollout', () => {
    vi.stubEnv('EMAIL_ACCOUNTS_ENCRYPTION_KEY', 'legacy-test-encryption-key');

    const encrypted = encryptCredential('smtp-secret');

    expect(decryptCredential(encrypted)).toBe('smtp-secret');
  });

  it('can read the typo key name during rollout', () => {
    vi.stubEnv('ENCYRPTION_KEY', 'typo-test-encryption-key');

    const encrypted = encryptCredential('smtp-secret');

    expect(decryptCredential(encrypted)).toBe('smtp-secret');
  });

  it('requires an encryption key for new encrypted writes', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    vi.stubEnv('ENCYRPTION_KEY', '');
    vi.stubEnv('EMAIL_ACCOUNTS_ENCRYPTION_KEY', '');

    expect(() => encryptCredential('secret')).toThrow(/ENCRYPTION_KEY/);
  });
});
