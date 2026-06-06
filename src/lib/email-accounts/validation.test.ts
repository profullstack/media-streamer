import { describe, expect, it } from 'vitest';
import {
  validateCreateEmailAccountInput,
  validateUpdateEmailAccountInput,
} from './validation';

describe('email account validation', () => {
  it('accepts valid SMTP account creation input', () => {
    const input = validateCreateEmailAccountInput({
      label: 'Personal',
      fromEmail: 'me@example.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecurity: 'starttls',
      smtpUsername: 'me@example.com',
      smtpPassword: 'app-password',
      isDefault: true,
    });

    expect(input).toMatchObject({
      label: 'Personal',
      fromEmail: 'me@example.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecurity: 'starttls',
      smtpUsername: 'me@example.com',
      smtpPassword: 'app-password',
      isDefault: true,
    });
  });

  it('rejects invalid SMTP account creation input', () => {
    expect(validateCreateEmailAccountInput({
      label: 'Bad',
      fromEmail: 'not-an-email',
      smtpHost: 'smtp.example.com',
      smtpPort: 70000,
      smtpSecurity: 'starttls',
      smtpPassword: 'secret',
    })).toBeNull();
  });

  it('accepts partial account updates but requires at least one valid field', () => {
    expect(validateUpdateEmailAccountInput({ fromName: 'Me' })).toEqual({ fromName: 'Me' });
    expect(validateUpdateEmailAccountInput({})).toBeNull();
    expect(validateUpdateEmailAccountInput({ smtpSecurity: 'ssl' })).toBeNull();
  });
});
