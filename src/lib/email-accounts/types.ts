export type SmtpSecurity = 'none' | 'starttls' | 'tls';
export type EmailAccountCheckStatus = 'unchecked' | 'success' | 'failed';

export interface EmailAccount {
  id: string;
  userId: string;
  label: string;
  provider: string | null;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurity;
  smtpUsername: string | null;
  smtpPassword: string;
  isDefault: boolean;
  lastCheckedAt: string | null;
  lastCheckStatus: EmailAccountCheckStatus;
  lastCheckError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicEmailAccount {
  id: string;
  label: string;
  provider: string | null;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurity;
  smtpUsername: string | null;
  isDefault: boolean;
  lastCheckedAt: string | null;
  lastCheckStatus: EmailAccountCheckStatus;
  lastCheckError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmailAccountInput {
  label: string;
  provider?: string | null;
  fromEmail: string;
  fromName?: string | null;
  replyToEmail?: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurity;
  smtpUsername?: string | null;
  smtpPassword: string;
  isDefault?: boolean;
}

export type UpdateEmailAccountInput = Partial<Omit<CreateEmailAccountInput, 'smtpPassword'>> & {
  smtpPassword?: string;
};

export interface SmtpCheckResult {
  success: boolean;
  error?: string;
}
