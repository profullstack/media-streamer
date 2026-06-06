import type { CreateEmailAccountInput, SmtpSecurity, UpdateEmailAccountInput } from './types';
import { normalizeSmtpSecurity, normalizeSmtpUsername } from './provider-settings';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECURITY_VALUES: SmtpSecurity[] = ['none', 'starttls', 'tls'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidEmailAddress(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function sanitizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function validateCreateEmailAccountInput(body: unknown): CreateEmailAccountInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as Record<string, unknown>;

  if (
    !isNonEmptyString(obj.label) ||
    !isNonEmptyString(obj.fromEmail) ||
    !isNonEmptyString(obj.smtpHost) ||
    typeof obj.smtpPort !== 'number' ||
    !SECURITY_VALUES.includes(obj.smtpSecurity as SmtpSecurity) ||
    !isNonEmptyString(obj.smtpPassword)
  ) {
    return null;
  }

  const fromEmail = obj.fromEmail.trim();
  const replyToEmail = sanitizeOptionalString(obj.replyToEmail as string | null | undefined);
  if (!isValidEmailAddress(fromEmail) || (replyToEmail && !isValidEmailAddress(replyToEmail))) {
    return null;
  }

  if (!Number.isInteger(obj.smtpPort) || obj.smtpPort <= 0 || obj.smtpPort > 65535) {
    return null;
  }

  const provider = sanitizeOptionalString(obj.provider as string | null | undefined);
  const smtpHost = obj.smtpHost.trim();
  const smtpPort = obj.smtpPort;
  const smtpSecurity = normalizeSmtpSecurity(
    provider,
    smtpHost,
    smtpPort,
    obj.smtpSecurity as SmtpSecurity
  );
  const smtpUsername = normalizeSmtpUsername(
    provider,
    smtpHost,
    fromEmail,
    sanitizeOptionalString(obj.smtpUsername as string | null | undefined)
  );

  return {
    label: obj.label.trim(),
    provider,
    fromEmail,
    fromName: sanitizeOptionalString(obj.fromName as string | null | undefined),
    replyToEmail,
    smtpHost,
    smtpPort,
    smtpSecurity,
    smtpUsername,
    smtpPassword: obj.smtpPassword,
    isDefault: typeof obj.isDefault === 'boolean' ? obj.isDefault : false,
  };
}

export function validateUpdateEmailAccountInput(body: unknown): UpdateEmailAccountInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as Record<string, unknown>;
  const input: UpdateEmailAccountInput = {};

  if ('label' in obj) {
    if (!isNonEmptyString(obj.label)) return null;
    input.label = obj.label.trim();
  }
  if ('provider' in obj) input.provider = sanitizeOptionalString(obj.provider as string | null | undefined);
  if ('fromEmail' in obj) {
    if (!isNonEmptyString(obj.fromEmail) || !isValidEmailAddress(obj.fromEmail.trim())) return null;
    input.fromEmail = obj.fromEmail.trim();
  }
  if ('fromName' in obj) input.fromName = sanitizeOptionalString(obj.fromName as string | null | undefined);
  if ('replyToEmail' in obj) {
    const replyToEmail = sanitizeOptionalString(obj.replyToEmail as string | null | undefined);
    if (replyToEmail && !isValidEmailAddress(replyToEmail)) return null;
    input.replyToEmail = replyToEmail;
  }
  if ('smtpHost' in obj) {
    if (!isNonEmptyString(obj.smtpHost)) return null;
    input.smtpHost = obj.smtpHost.trim();
  }
  if ('smtpPort' in obj) {
    if (typeof obj.smtpPort !== 'number' || !Number.isInteger(obj.smtpPort) || obj.smtpPort <= 0 || obj.smtpPort > 65535) {
      return null;
    }
    input.smtpPort = obj.smtpPort;
  }
  if ('smtpSecurity' in obj) {
    if (!SECURITY_VALUES.includes(obj.smtpSecurity as SmtpSecurity)) return null;
    input.smtpSecurity = obj.smtpSecurity as SmtpSecurity;
  }
  if ('smtpUsername' in obj) input.smtpUsername = sanitizeOptionalString(obj.smtpUsername as string | null | undefined);
  if ('smtpPassword' in obj) {
    if (!isNonEmptyString(obj.smtpPassword)) return null;
    input.smtpPassword = obj.smtpPassword;
  }
  if ('isDefault' in obj) {
    if (typeof obj.isDefault !== 'boolean') return null;
    input.isDefault = obj.isDefault;
  }

  if (input.smtpHost !== undefined || input.smtpPort !== undefined || input.smtpSecurity !== undefined || input.provider !== undefined) {
    const provider = input.provider ?? sanitizeOptionalString(obj.provider as string | null | undefined);
    const smtpHost = input.smtpHost ?? sanitizeOptionalString(obj.smtpHost as string | null | undefined);
    const smtpPort = input.smtpPort ?? (typeof obj.smtpPort === 'number' ? obj.smtpPort : undefined);
    const smtpSecurity = input.smtpSecurity ?? (SECURITY_VALUES.includes(obj.smtpSecurity as SmtpSecurity) ? obj.smtpSecurity as SmtpSecurity : undefined);
    if (smtpHost && smtpPort && smtpSecurity) {
      input.smtpSecurity = normalizeSmtpSecurity(provider, smtpHost, smtpPort, smtpSecurity);
    }
  }

  if (input.fromEmail && (input.smtpHost || sanitizeOptionalString(obj.smtpHost as string | null | undefined))) {
    input.smtpUsername = normalizeSmtpUsername(
      input.provider ?? sanitizeOptionalString(obj.provider as string | null | undefined),
      input.smtpHost ?? sanitizeOptionalString(obj.smtpHost as string | null | undefined) ?? '',
      input.fromEmail,
      input.smtpUsername ?? sanitizeOptionalString(obj.smtpUsername as string | null | undefined)
    );
  }

  return Object.keys(input).length > 0 ? input : null;
}
