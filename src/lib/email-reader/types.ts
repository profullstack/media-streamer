import type { EmailAccount } from '@/lib/email-accounts';

export interface ImapConnectionSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface MailboxAccount {
  account: EmailAccount;
  imap: ImapConnectionSettings | null;
}

export interface EmailMessageSummary {
  uid: number;
  subject: string;
  from: string;
  to: string[];
  date: string | null;
  isRead: boolean;
}

export interface EmailMessage extends EmailMessageSummary {
  text: string;
  html: string | null;
}
