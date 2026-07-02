import { describe, expect, it } from 'vitest';
import { isSmtpPortSecurityMismatch, validateSmtpPortSecurity } from './provider-settings';

describe('validateSmtpPortSecurity', () => {
  it('accepts implicit-TLS ports with TLS security', () => {
    expect(validateSmtpPortSecurity(465, 'tls')).toBeNull();
    expect(validateSmtpPortSecurity(2465, 'tls')).toBeNull();
  });

  it('accepts STARTTLS ports with starttls or none', () => {
    expect(validateSmtpPortSecurity(587, 'starttls')).toBeNull();
    expect(validateSmtpPortSecurity(25, 'none')).toBeNull();
  });

  it('rejects implicit-TLS ports without TLS (the 465 + STARTTLS timeout bug)', () => {
    const message = validateSmtpPortSecurity(465, 'starttls');
    expect(message).toContain('Port 465');
    expect(message).toContain('TLS');
    expect(isSmtpPortSecurityMismatch(message!)).toBe(true);
  });

  it('rejects STARTTLS ports with implicit TLS', () => {
    const message = validateSmtpPortSecurity(587, 'tls');
    expect(message).toContain('Port 587');
    expect(message).toContain('STARTTLS');
    expect(isSmtpPortSecurityMismatch(message!)).toBe(true);
  });

  it('leaves non-standard ports alone (no false positives)', () => {
    expect(validateSmtpPortSecurity(2525, 'starttls')).toBeNull();
    expect(validateSmtpPortSecurity(1025, 'tls')).toBeNull();
    expect(validateSmtpPortSecurity(1025, 'none')).toBeNull();
  });
});
