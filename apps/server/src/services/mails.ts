import type { Mail } from './notifier.js';

type Body = Pick<Mail, 'subject' | 'text'>;

const IST = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' } as const;
export const fmt = (d: Date) => `${d.toLocaleString('en-IN', IST)} IST`;

const lines = (...l: string[]) => l.join('\n');

export function checkIn(o: { name: string; url: string; reminder: 0 | 1 | 2; daysLeft: number }): Body {
  const subject = o.reminder === 0 ? 'Are you okay? Please confirm' : `Reminder ${o.reminder} of 2: please confirm you are okay`;
  return {
    subject,
    text: lines(
      `Hi ${o.name},`,
      '',
      o.reminder === 0 ? 'This is your regular safety check-in from Family Emergency Vault.' : 'We have not heard back from you yet.',
      'Please open this link and press "I am okay":',
      o.url,
      '',
      `If we still hear nothing, your trusted people will be asked to help in about ${o.daysLeft} day(s).`,
      'If you did not set this up, you can ignore this email.',
    ),
  };
}

export function escalatedToOwner(o: { name: string; url: string }): Body {
  return {
    subject: 'We could not reach you. Your trusted people have been asked to help',
    text: lines(
      `Hi ${o.name},`,
      '',
      'You did not answer your safety check-ins, so we have asked your trusted people whether the vault should be opened.',
      'If you are fine, press this link to stop it right now:',
      o.url,
    ),
  };
}

export function approvalRequest(o: { contact: string; owner: string; url: string; needed: number; total: number; waitingDays: number }): Body {
  return {
    subject: `${o.owner} has not answered safety check-ins. Your help is needed`,
    text: lines(
      `Hi ${o.contact},`,
      '',
      `${o.owner} has not answered several safety check-ins from Family Emergency Vault.`,
      `Please try to reach ${o.owner} first (call, message, or visit).`,
      '',
      `If you cannot reach them and you believe the vault should be opened, approve here:`,
      o.url,
      '',
      `${o.needed} of the ${o.total} trusted people must approve. After that there is a ${o.waitingDays}-day waiting period during which ${o.owner} can still stop it.`,
      `If ${o.owner} is fine, do nothing.`,
    ),
  };
}

export function waitingStartedOwner(o: { name: string; url: string; opensAt: Date }): Body {
  return {
    subject: `Your vault will open on ${fmt(o.opensAt)} unless you stop it`,
    text: lines(
      `Hi ${o.name},`,
      '',
      'Enough trusted people have approved opening your vault.',
      `It will open on ${fmt(o.opensAt)}.`,
      'If you are fine, press this link to stop it:',
      o.url,
    ),
  };
}

export function waitingStartedContact(o: { contact: string; owner: string; opensAt: Date }): Body {
  return {
    subject: `Enough people have approved. Access opens on ${fmt(o.opensAt)}`,
    text: lines(
      `Hi ${o.contact},`,
      '',
      `Enough trusted people have approved opening ${o.owner}'s vault.`,
      `Access opens on ${fmt(o.opensAt)} unless ${o.owner} says they are fine before then.`,
    ),
  };
}

export function unlockedOwner(o: { name: string }): Body {
  return {
    subject: 'Your vault has been opened for your trusted people',
    text: lines(`Hi ${o.name},`, '', 'The waiting period has ended and your trusted people can now open your vault.'),
  };
}

export function unlockedContact(o: { contact: string; owner: string; url: string }): Body {
  return {
    subject: `${o.owner}'s vault is now open to you`,
    text: lines(
      `Hi ${o.contact},`,
      '',
      `The waiting period has ended. Together with the other trusted people you can now open ${o.owner}'s vault.`,
      'Open this link (it works in Hindi and English):',
      o.url,
      '',
      'You will need the passphrase you chose when you accepted the invitation. Each trusted person gives their key piece code to whoever is opening the vault.',
    ),
  };
}

export function cancelledOwner(o: { name: string }): Body {
  return {
    subject: 'The request to open your vault was stopped',
    text: lines(`Hi ${o.name},`, '', 'You confirmed you are okay, so the request has been cancelled and your vault stays closed.'),
  };
}

export function cancelledContact(o: { contact: string; owner: string }): Body {
  return {
    subject: `${o.owner} is okay. The request was cancelled`,
    text: lines(`Hi ${o.contact},`, '', `${o.owner} confirmed they are okay. Nothing more is needed from you.`),
  };
}

export function approvalsLostOwner(o: { name: string }): Body {
  return {
    subject: 'A request to open your vault needs attention',
    text: lines(
      `Hi ${o.name},`,
      '',
      'A trusted person was removed while the waiting period was running, so there are no longer enough approvals.',
      'Nothing will open. The request is back to waiting for approvals.',
    ),
  };
}

export function accessClosedOwner(o: { name: string }): Body {
  return {
    subject: 'Access to your vault was closed',
    text: lines(
      `Hi ${o.name},`,
      '',
      'You closed access, and the safety switch has restarted.',
      'Anything your trusted people already opened or copied cannot be taken back. Consider updating sensitive details in your vault.',
    ),
  };
}

export function accessClosedContact(o: { contact: string; owner: string }): Body {
  return {
    subject: `${o.owner} is back. Access to the vault was closed`,
    text: lines(`Hi ${o.contact},`, '', `${o.owner} is back and has closed access to the vault. Your access link no longer works. Nothing more is needed from you.`),
  };
}
