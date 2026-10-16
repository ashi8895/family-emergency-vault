import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface InviteMessage {
  to: string;
  contactName: string;
  ownerName: string;
  inviteUrl: string;
  expiresInDays: number;
}

/**
 * Swappable delivery layer. Today: console or email. Later: WhatsApp/SMS can implement the same interface
 * without touching any route or scheduler code.
 */
export interface Notifier {
  send(mail: Mail): Promise<void>;
  sendInvite(msg: InviteMessage): Promise<void>;
}

const inviteMail = (msg: InviteMessage): Mail => ({
  to: msg.to,
  subject: `${msg.ownerName} has asked you to be a trusted contact`,
  text: [
    `Hi ${msg.contactName},`,
    '',
    `${msg.ownerName} has asked you to be one of the trusted people for their Family Emergency Vault.`,
    'You will hold one piece of a key. On its own it opens nothing.',
    '',
    `Open this link to accept (valid for ${msg.expiresInDays} days):`,
    msg.inviteUrl,
    '',
    `If you do not know ${msg.ownerName}, ignore this email.`,
  ].join('\n'),
});

class ConsoleNotifier implements Notifier {
  async send(mail: Mail) {
    if (env.NODE_ENV === 'production') {
      console.warn('No SMTP_URL configured: an email was NOT sent.');
      return;
    }
    // Development only: links inside are secrets, so nothing is printed in production.
    console.log(`\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n${mail.text}\n`);
  }
  sendInvite(msg: InviteMessage) {
    return this.send(inviteMail(msg));
  }
}

class SmtpNotifier implements Notifier {
  private transport = nodemailer.createTransport(env.SMTP_URL!);
  async send(mail: Mail) {
    await this.transport.sendMail({ from: env.MAIL_FROM, ...mail });
  }
  sendInvite(msg: InviteMessage) {
    return this.send(inviteMail(msg));
  }
}

export const notifier: Notifier = env.SMTP_URL ? new SmtpNotifier() : new ConsoleNotifier();
