import type { EmailAccount } from '@/lib/email-accounts';

export interface ImapConnectionSettings {
  host: string;
  port: number;
  alternatePorts?: number[];
  secure: boolean;
  loginMethod?: 'LOGIN' | 'AUTH=LOGIN' | 'AUTH=PLAIN';
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
  fromEmail: string | null;
  to: string[];
  date: string | null;
  isRead: boolean;
}

export interface EmailMessage extends EmailMessageSummary {
  replyTo: string[];
  messageId: string | null;
  references: string[];
  text: string;
  html: string | null;
}
