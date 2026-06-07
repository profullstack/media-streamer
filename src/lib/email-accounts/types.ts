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
  imapHost: string | null;
  imapPort: number | null;
  imapSecurity: SmtpSecurity | null;
  imapUsername: string | null;
  imapPassword: string | null;
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
  imapHost: string | null;
  imapPort: number | null;
  imapSecurity: SmtpSecurity | null;
  imapUsername: string | null;
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
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecurity?: SmtpSecurity | null;
  imapUsername?: string | null;
  imapPassword?: string | null;
  isDefault?: boolean;
}

export type UpdateEmailAccountInput = Partial<Omit<CreateEmailAccountInput, 'smtpPassword' | 'imapPassword'>> & {
  smtpPassword?: string;
  imapPassword?: string;
};

export interface SmtpCheckResult {
  success: boolean;
  error?: string;
}
