import { randomBytes } from 'node:crypto';
import type { HydratedDocument, Types } from 'mongoose';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.js';
import { EmergencyCase } from '../models/EmergencyCase.js';
import { TrustedContact } from '../models/TrustedContact.js';
import { User, type IUser } from '../models/User.js';
import * as sm from './emergencyStateMachine.js';
import { accessUrl, aliveUrl, approveUrl, parseLinkToken } from './links.js';
import { audit, contactActor, OWNER, SYSTEM } from './audit.js';
import * as mails from './mails.js';
import { notifier } from './notifier.js';

/**
 * Glue between the pure state machine and the real world (MongoDB, email).
 * Pattern used everywhere: compute the next state with the pure machine, write it with a conditional update
 * (filter on the old state + cycle id), and only send emails if that write actually matched. If the owner
 * checked in a millisecond earlier, the write matches nothing and no stale email goes out.
 */
const DAY = env.TIME_UNIT_MS;
const DEFAULTS = { checkInIntervalDays: 30, reminderGapDays: 3, waitingPeriodDays: 7 };
const LEASE_MS = 5 * 60 * 1000;

type UserDoc = HydratedDocument<IUser>;

// ---------- small helpers ----------
export const newCycleId = () => randomBytes(12).toString('hex');

export const settingsOf = (s?: Partial<typeof DEFAULTS> | null) => ({
  checkInIntervalDays: s?.checkInIntervalDays ?? DEFAULTS.checkInIntervalDays,
  reminderGapDays: s?.reminderGapDays ?? DEFAULTS.reminderGapDays,
  waitingPeriodDays: s?.waitingPeriodDays ?? DEFAULTS.waitingPeriodDays,
});

const cfgOf = (s?: Partial<typeof DEFAULTS> | null): sm.Cfg => {
  const v = settingsOf(s);
  return { checkInIntervalMs: v.checkInIntervalDays * DAY, reminderGapMs: v.reminderGapDays * DAY, waitingPeriodMs: v.waitingPeriodDays * DAY };
};

const coreOf = (u: UserDoc): sm.Core => ({
  state: u.emergency!.state,
  remindersSent: u.emergency!.remindersSent ?? 0,
  lastCheckInAt: u.emergency!.lastCheckInAt,
  nextActionAt: u.emergency!.nextActionAt ?? null,
  unlocksAt: u.emergency!.unlocksAt ?? null,
});

const setFromCore = (c: sm.Core) => ({
  'emergency.state': c.state,
  'emergency.remindersSent': c.remindersSent,
  'emergency.lastCheckInAt': c.lastCheckInAt,
  'emergency.nextActionAt': c.nextActionAt,
  'emergency.unlocksAt': c.unlocksAt,
});

/** Value stored on a brand new account. */
export function initialEmergency(now = new Date()) {
  return {
    state: 'ACTIVE' as const,
    cycleId: newCycleId(),
    lastCheckInAt: now,
    nextActionAt: new Date(now.getTime() + DEFAULTS.checkInIntervalDays * DAY),
    remindersSent: 0,
    unlocksAt: null,
    caseId: null,
  };
}

/** Accounts created before Phase 3 get a switch too (one raw update, runs at every boot, does nothing once done). */
export async function ensureEmergencyForExistingUsers() {
  await User.collection.updateMany({ emergency: { $exists: false } }, [
    {
      $set: {
        emergency: {
          state: 'ACTIVE',
          cycleId: { $toString: '$_id' },
          lastCheckInAt: '$$NOW',
          nextActionAt: { $add: ['$$NOW', DEFAULTS.checkInIntervalDays * DAY] },
          remindersSent: 0,
          unlocksAt: null,
          caseId: null,
        },
      },
    },
  ]);
}

async function send(to: string, body: { subject: string; text: string }) {
  try {
    await notifier.send({ to, ...body });
  } catch (e) {
    console.error('Email failed:', e instanceof Error ? e.message : 'unknown');
  }
}

/** The switch is "armed" only when enough trusted people hold a current key piece, otherwise nobody could open anything. */
async function armedInfo(userId: Types.ObjectId) {
  const [user, contacts] = await Promise.all([
    User.findById(userId).select('shares'),
    TrustedContact.find({ ownerId: userId, status: 'ACCEPTED' }),
  ]);
  const shares = user?.shares ?? null;
  const holders = shares ? contacts.filter((c) => c.shareGeneration === shares.generation) : [];
  const armed = !!shares && holders.length >= shares.threshold;
  const reason = !shares
    ? 'Create key pieces first (Trusted people tab).'
    : holders.length < shares.threshold
      ? 'Not enough trusted people hold a current key piece. Create the key pieces again.'
      : null;
  return { armed, reason, shares, contacts, acceptedIds: new Set(contacts.map((c) => c.id as string)) };
}

const countValid = (c: { approvals: { contactId: unknown }[] }, acceptedIds: Set<string>) =>
  c.approvals.filter((a) => acceptedIds.has(String(a.contactId))).length;

// ---------- owner actions ----------

/** "I am okay": check-in link, button, settings change, signing in, or arming. Cancels any running request. */
export async function ownerConfirmsAlive(userId: string, now = new Date(), source = 'button') {
  const u = await User.findById(userId);
  if (!u?.emergency) throw new HttpError(404, 'Account not found');

  let t: sm.Transition;
  try {
    t = sm.ownerAlive(coreOf(u), cfgOf(u.settings), now);
  } catch (e) {
    if (e instanceof sm.InvalidTransition) throw new HttpError(409, 'The vault has already been opened for your trusted people.');
    throw e;
  }

  const res = await User.updateOne(
    { _id: u._id, 'emergency.state': u.emergency.state, 'emergency.cycleId': u.emergency.cycleId },
    { $set: { ...setFromCore(t.core), 'emergency.cycleId': newCycleId(), 'emergency.caseId': null } },
  );
  if (res.matchedCount === 0) throw new HttpError(409, 'Something changed at the same moment. Please try again.');

  if (source !== 'login') await audit(u._id, OWNER, 'switch.checkin', { source }); // every sign-in would be noise
  if (t.effects.includes('CANCELLED')) {
    await audit(u._id, OWNER, 'switch.cancelled', { source, from: u.emergency.state });
    if (u.emergency.caseId) {
      await EmergencyCase.updateOne(
        { _id: u.emergency.caseId, state: { $in: ['PENDING_APPROVAL', 'WAITING_PERIOD'] } },
        { $set: { state: 'CANCELLED', cancelledAt: now, cancelledBy: 'owner' } },
      );
    }
    await send(u.email, mails.cancelledOwner({ name: u.name }));
    const contacts = await TrustedContact.find({ ownerId: u._id, status: 'ACCEPTED' });
    await Promise.all(contacts.map((c) => send(c.email, mails.cancelledContact({ contact: c.name, owner: u.name }))));
  }
}

/** Signing in proves the owner is alive, but never silently cancels a running request: the banner asks them to. */
export async function checkInOnLogin(userId: string) {
  try {
    const u = await User.findById(userId).select('emergency');
    if (u?.emergency && (u.emergency.state === 'ACTIVE' || u.emergency.state === 'WARNING')) await ownerConfirmsAlive(userId, new Date(), 'login');
  } catch (e) {
    console.error('Check-in on login failed:', e instanceof Error ? e.message : 'unknown');
  }
}

export async function updateSettings(userId: string, s: typeof DEFAULTS) {
  const u = await User.findById(userId).select('emergency');
  if (!u?.emergency) throw new HttpError(404, 'Account not found');
  if (u.emergency.state !== 'ACTIVE' && u.emergency.state !== 'WARNING') {
    throw new HttpError(409, 'Settings cannot be changed while an emergency request is running.');
  }
  await User.updateOne({ _id: userId }, { $set: { settings: s } });
  await audit(userId, OWNER, 'settings.changed', { checkInDays: s.checkInIntervalDays, reminderGapDays: s.reminderGapDays, waitingDays: s.waitingPeriodDays });
  await ownerConfirmsAlive(userId, new Date(), 'settings'); // changing settings counts as a check-in and restarts the clock
}

export async function getStatus(userId: string) {
  const u = await User.findById(userId);
  if (!u?.emergency) throw new HttpError(404, 'Account not found');
  const info = await armedInfo(u._id);

  let theCase: {
    state: string;
    needed: number;
    approvals: { name: string; approvedAt: Date }[];
    unlocksAt: Date | null;
  } | null = null;
  if (u.emergency.caseId) {
    const c = await EmergencyCase.findById(u.emergency.caseId);
    if (c) {
      const byId = new Map(info.contacts.map((x) => [x.id as string, x.name]));
      theCase = {
        state: c.state,
        needed: c.threshold,
        approvals: c.approvals.filter((a) => byId.has(String(a.contactId))).map((a) => ({ name: byId.get(String(a.contactId))!, approvedAt: a.approvedAt })),
        unlocksAt: c.unlocksAt ?? null,
      };
    }
  }

  return {
    state: u.emergency.state,
    armed: info.armed,
    armedReason: info.reason,
    lastCheckInAt: u.emergency.lastCheckInAt,
    nextActionAt: u.emergency.nextActionAt ?? null,
    remindersSent: u.emergency.remindersSent ?? 0,
    maxReminders: sm.MAX_REMINDERS,
    settings: settingsOf(u.settings),
    case: theCase,
  };
}

// ---------- scheduler work ----------

export async function processDue(now = new Date()) {
  const due = await User.find({
    'emergency.nextActionAt': { $lte: now },
    'emergency.state': { $in: ['ACTIVE', 'WARNING', 'WAITING_PERIOD'] },
  })
    .select('_id')
    .limit(100);
  for (const { id } of due) {
    await processUser(id, now).catch((e) => console.error('Scheduler error for one account:', e instanceof Error ? e.message : 'unknown'));
  }
}

async function processUser(userId: string, now: Date) {
  // Claim the work by pushing nextActionAt into the future. If two server processes race, only one gets the document.
  const before = await User.findOneAndUpdate(
    { _id: userId, 'emergency.nextActionAt': { $lte: now }, 'emergency.state': { $in: ['ACTIVE', 'WARNING', 'WAITING_PERIOD'] } },
    { $set: { 'emergency.nextActionAt': new Date(now.getTime() + LEASE_MS) } },
    { new: false },
  );
  if (!before?.emergency) return;

  const cfg = cfgOf(before.settings);
  const core = coreOf(before);
  const info = await armedInfo(before._id);
  const guard = { _id: before._id, 'emergency.state': before.emergency.state, 'emergency.cycleId': before.emergency.cycleId };

  // Not armed: nobody could open the vault, so asking "are you okay?" would only cause worry. Look again later.
  if (!info.armed && core.state !== 'WAITING_PERIOD') {
    await User.updateOne(guard, { $set: setFromCore(sm.newCore(cfg, now)) });
    return;
  }

  let ctx = { validApprovals: 0, threshold: info.shares?.threshold ?? 2 };
  const theCase = core.state === 'WAITING_PERIOD' && before.emergency.caseId ? await EmergencyCase.findById(before.emergency.caseId) : null;
  if (theCase) ctx = { validApprovals: countValid(theCase, info.acceptedIds), threshold: theCase.threshold };

  const t = sm.tick(core, cfg, now, ctx);
  if (!t) return;

  const apply = async (extra: Record<string, unknown> = {}) =>
    (await User.updateOne(guard, { $set: { ...setFromCore(t.core), ...extra } })).matchedCount > 0;

  const v = settingsOf(before.settings);
  const link = aliveUrl(before.id, before.emergency.cycleId);

  switch (t.effects[0]) {
    case 'SEND_CHECKIN':
    case 'SEND_REMINDER': {
      if (!(await apply())) return;
      const n = t.core.remindersSent as 0 | 1 | 2;
      const daysLeft = (sm.MAX_REMINDERS + 1 - n) * v.reminderGapDays;
      await audit(before._id, SYSTEM, n === 0 ? 'switch.checkin_email' : 'switch.reminder_email', { n });
      await send(before.email, mails.checkIn({ name: before.name, url: link, reminder: n, daysLeft }));
      return;
    }

    case 'OPEN_CASE_AND_NOTIFY': {
      const shares = info.shares!;
      const c = await EmergencyCase.create({
        ownerId: before._id,
        state: 'PENDING_APPROVAL',
        openedAt: now,
        threshold: shares.threshold,
        shareGeneration: shares.generation,
        approvals: [],
      });
      if (!(await apply({ 'emergency.caseId': c._id }))) {
        await EmergencyCase.deleteOne({ _id: c._id }); // the owner checked in while we were working
        return;
      }
      await audit(before._id, SYSTEM, 'switch.escalated', { contacts: info.contacts.length, needed: shares.threshold });
      await send(before.email, mails.escalatedToOwner({ name: before.name, url: link }));
      await Promise.all(
        info.contacts.map((ct) =>
          send(ct.email, mails.approvalRequest({ contact: ct.name, owner: before.name, url: approveUrl(c.id, ct.id), needed: shares.threshold, total: info.contacts.length, waitingDays: v.waitingPeriodDays })),
        ),
      );
      return;
    }

    case 'UNLOCKED': {
      if (!(await apply())) return;
      if (before.emergency.caseId) {
        await EmergencyCase.updateOne({ _id: before.emergency.caseId }, { $set: { state: 'UNLOCKED', unlockedAt: now } });
      }
      await audit(before._id, SYSTEM, 'switch.unlocked', {});
      await send(before.email, mails.unlockedOwner({ name: before.name }));
      await Promise.all(
        info.contacts.map((ct) =>
          send(ct.email, mails.unlockedContact({ contact: ct.name, owner: before.name, url: accessUrl(String(before.emergency!.caseId), ct.id) })),
        ),
      );
      return;
    }

    case 'APPROVALS_LOST': {
      if (!(await apply())) return;
      if (before.emergency.caseId) {
        await EmergencyCase.updateOne(
          { _id: before.emergency.caseId },
          { $set: { state: 'PENDING_APPROVAL' }, $unset: { waitingStartsAt: '', unlocksAt: '' } },
        );
      }
      await audit(before._id, SYSTEM, 'switch.approvals_lost', {});
      await send(before.email, mails.approvalsLostOwner({ name: before.name }));
      return;
    }
  }
}

// ---------- public links ----------

type AliveStatus = { status: 'ready' | 'used' | 'unlocked'; ownerName: string; requestRunning: boolean };

async function readAlive(token: string) {
  const parts = parseLinkToken(token);
  if (!parts || parts[0] !== 'alive' || parts.length !== 3) return null;
  const u = await User.findById(parts[1]).select('name emergency');
  if (!u?.emergency) return null;
  return { u, cycleId: parts[2] };
}

export async function describeAlive(token: string): Promise<AliveStatus | null> {
  const r = await readAlive(token);
  if (!r) return null;
  const { u, cycleId } = r;
  const state = u.emergency!.state;
  const requestRunning = state === 'PENDING_APPROVAL' || state === 'WAITING_PERIOD';
  if (state === 'UNLOCKED') return { status: 'unlocked', ownerName: u.name, requestRunning };
  if (u.emergency!.cycleId !== cycleId) return { status: 'used', ownerName: u.name, requestRunning };
  return { status: 'ready', ownerName: u.name, requestRunning };
}

export async function confirmAlive(token: string): Promise<AliveStatus | null> {
  const before = await describeAlive(token);
  if (!before || before.status !== 'ready') return before;
  const r = (await readAlive(token))!;
  await ownerConfirmsAlive(r.u.id, new Date(), 'email_link');
  return { ...before, status: 'used' };
}

type ApproveStatus = 'ready' | 'already_approved' | 'waiting' | 'unlocked' | 'cancelled' | 'closed';

async function readApprove(token: string) {
  const parts = parseLinkToken(token);
  if (!parts || parts[0] !== 'approve' || parts.length !== 3) return null;
  const [c, contact] = await Promise.all([EmergencyCase.findById(parts[1]), TrustedContact.findById(parts[2])]);
  if (!c || !contact || contact.status !== 'ACCEPTED' || String(contact.ownerId) !== String(c.ownerId)) return null;
  const owner = await User.findById(c.ownerId).select('name settings emergency');
  if (!owner) return null;
  return { c, contact, owner };
}

async function approveView(r: NonNullable<Awaited<ReturnType<typeof readApprove>>>) {
  const info = await armedInfo(r.owner._id);
  const approved = countValid(r.c, info.acceptedIds);
  const mine = r.c.approvals.some((a) => String(a.contactId) === r.contact.id);
  const status: ApproveStatus =
    r.c.state === 'PENDING_APPROVAL' ? (mine ? 'already_approved' : 'ready')
    : r.c.state === 'WAITING_PERIOD' ? 'waiting'
    : r.c.state === 'UNLOCKED' ? 'unlocked'
    : r.c.state === 'CLOSED' ? 'closed'
    : 'cancelled';
  return {
    status,
    ownerName: r.owner.name,
    contactName: r.contact.name,
    needed: r.c.threshold,
    approved,
    unlocksAt: r.c.unlocksAt ?? null,
    waitingDays: settingsOf(r.owner.settings).waitingPeriodDays,
  };
}

export async function describeApprove(token: string) {
  const r = await readApprove(token);
  return r ? approveView(r) : null;
}

export async function submitApproval(token: string, now = new Date()) {
  const r = await readApprove(token);
  if (!r) return null;
  const view = await approveView(r);
  if (view.status !== 'ready') return view;

  // $ne on contactId means a double click or a replayed link cannot add a second approval
  await EmergencyCase.updateOne(
    { _id: r.c._id, state: 'PENDING_APPROVAL', 'approvals.contactId': { $ne: r.contact._id } },
    { $push: { approvals: { contactId: r.contact._id, approvedAt: now } } },
  );

  await audit(r.owner._id, contactActor(r.contact.name), 'approval.given', {});
  const fresh = (await EmergencyCase.findById(r.c._id))!;
  const info = await armedInfo(r.owner._id);
  const owner = (await User.findById(r.owner._id))!;
  const t = sm.approvalsChanged(coreOf(owner), cfgOf(owner.settings), now, {
    validApprovals: countValid(fresh, info.acceptedIds),
    threshold: fresh.threshold,
  });

  if (t) {
    // Only one of several racing approvals can win this conditional update, so the waiting period starts exactly once.
    const won = await User.updateOne(
      { _id: owner._id, 'emergency.state': 'PENDING_APPROVAL', 'emergency.caseId': fresh._id },
      { $set: setFromCore(t.core) },
    );
    if (won.matchedCount > 0) {
      await EmergencyCase.updateOne({ _id: fresh._id, state: 'PENDING_APPROVAL' }, { $set: { state: 'WAITING_PERIOD', waitingStartsAt: now, unlocksAt: t.core.unlocksAt } });
      const opensAt = t.core.unlocksAt!;
      await audit(owner._id, SYSTEM, 'switch.waiting_started', { opensAt: opensAt.toISOString() });
      await send(owner.email, mails.waitingStartedOwner({ name: owner.name, url: aliveUrl(owner.id, owner.emergency!.cycleId), opensAt }));
      await Promise.all(info.contacts.map((ct) => send(ct.email, mails.waitingStartedContact({ contact: ct.name, owner: owner.name, opensAt }))));
    }
  }

  return approveView((await readApprove(token))!);
}


/** "I am back": the owner closes access after UNLOCKED. Cannot undo what was already seen, but stops all future access. */
export async function closeAccess(userId: string, now = new Date()) {
  const u = await User.findById(userId);
  if (!u?.emergency) throw new HttpError(404, 'Account not found');

  let t: sm.Transition;
  try {
    t = sm.ownerReturns(coreOf(u), cfgOf(u.settings), now);
  } catch (e) {
    if (e instanceof sm.InvalidTransition) throw new HttpError(409, 'The vault is not open to your trusted people.');
    throw e;
  }

  const res = await User.updateOne(
    { _id: u._id, 'emergency.state': 'UNLOCKED', 'emergency.cycleId': u.emergency.cycleId },
    { $set: { ...setFromCore(t.core), 'emergency.cycleId': newCycleId(), 'emergency.caseId': null } },
  );
  if (res.matchedCount === 0) throw new HttpError(409, 'Something changed at the same moment. Please try again.');

  if (u.emergency.caseId) {
    await EmergencyCase.updateOne({ _id: u.emergency.caseId, state: 'UNLOCKED' }, { $set: { state: 'CLOSED', closedAt: now } });
  }
  await audit(u._id, OWNER, 'access.closed', {});
  await send(u.email, mails.accessClosedOwner({ name: u.name }));
  const contacts = await TrustedContact.find({ ownerId: u._id, status: 'ACCEPTED' });
  await Promise.all(contacts.map((c) => send(c.email, mails.accessClosedContact({ contact: c.name, owner: u.name }))));
}
