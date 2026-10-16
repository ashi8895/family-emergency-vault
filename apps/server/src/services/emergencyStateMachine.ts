/**
 * The dead-man's switch as a PURE state machine: no database, no clock, no email.
 * Every function takes the current state and the current time and returns the next state plus a list of
 * side effects for the caller to perform. That makes the rules easy to read and easy to unit test.
 *
 *   ACTIVE ──(check-in due)──► WARNING ──(2 reminders ignored)──► PENDING_APPROVAL
 *      ▲                          │                                     │
 *      │                          │                          (enough trusted people approve)
 *      └──── owner says "I am okay" at ANY stage ◄─────────────────────┤
 *                                                                       ▼
 *                                              WAITING_PERIOD ──(time passes, approvals still valid)──► UNLOCKED
 */
export type EmergencyState = 'ACTIVE' | 'WARNING' | 'PENDING_APPROVAL' | 'WAITING_PERIOD' | 'UNLOCKED';

export type Effect =
  | 'SEND_CHECKIN' // first "are you okay?" email
  | 'SEND_REMINDER' // reminder 1 or 2
  | 'OPEN_CASE_AND_NOTIFY' // ask the trusted people to approve
  | 'WAITING_STARTED' // enough approvals: the waiting period begins
  | 'UNLOCKED' // waiting period over
  | 'APPROVALS_LOST' // someone was removed during the wait; approvals fell below the threshold
  | 'CANCELLED' // owner stopped a running request
  | 'ACCESS_CLOSED'; // owner came back after UNLOCKED and shut access again

export const MAX_REMINDERS = 2;

export class InvalidTransition extends Error {}

export interface Core {
  state: EmergencyState;
  remindersSent: number;
  lastCheckInAt: Date;
  /** When the scheduler should look at this switch again. null = nothing is timed (waiting for people). */
  nextActionAt: Date | null;
  unlocksAt: Date | null;
}

export interface Cfg {
  checkInIntervalMs: number; // how often the owner must check in
  reminderGapMs: number; // gap between the check-in email, each reminder, and the escalation
  waitingPeriodMs: number; // cooling-off period after enough people approve
}

export interface Transition {
  core: Core;
  effects: Effect[];
}

const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);

/** A fresh, healthy switch: the owner has just checked in. */
export function newCore(cfg: Cfg, now: Date): Core {
  return { state: 'ACTIVE', remindersSent: 0, lastCheckInAt: now, nextActionAt: addMs(now, cfg.checkInIntervalMs), unlocksAt: null };
}

/** Time-driven steps. Returns null when nothing is due. */
export function tick(
  core: Core,
  cfg: Cfg,
  now: Date,
  ctx: { validApprovals: number; threshold: number },
): Transition | null {
  if (!core.nextActionAt || now < core.nextActionAt) return null;

  switch (core.state) {
    case 'ACTIVE':
      return {
        core: { ...core, state: 'WARNING', remindersSent: 0, nextActionAt: addMs(now, cfg.reminderGapMs) },
        effects: ['SEND_CHECKIN'],
      };

    case 'WARNING':
      if (core.remindersSent < MAX_REMINDERS) {
        return {
          core: { ...core, remindersSent: core.remindersSent + 1, nextActionAt: addMs(now, cfg.reminderGapMs) },
          effects: ['SEND_REMINDER'],
        };
      }
      return { core: { ...core, state: 'PENDING_APPROVAL', nextActionAt: null }, effects: ['OPEN_CASE_AND_NOTIFY'] };

    case 'WAITING_PERIOD':
      // Re-check at the last moment: if people were removed during the wait, do not open.
      if (ctx.validApprovals >= ctx.threshold) {
        return { core: { ...core, state: 'UNLOCKED', nextActionAt: null }, effects: ['UNLOCKED'] };
      }
      return {
        core: { ...core, state: 'PENDING_APPROVAL', unlocksAt: null, nextActionAt: null },
        effects: ['APPROVALS_LOST'],
      };

    default:
      return null; // PENDING_APPROVAL and UNLOCKED have no timer
  }
}

/** A trusted person approved (or someone was removed): maybe the waiting period can start. */
export function approvalsChanged(
  core: Core,
  cfg: Cfg,
  now: Date,
  ctx: { validApprovals: number; threshold: number },
): Transition | null {
  if (core.state !== 'PENDING_APPROVAL' || ctx.validApprovals < ctx.threshold) return null;
  const unlocksAt = addMs(now, cfg.waitingPeriodMs);
  return { core: { ...core, state: 'WAITING_PERIOD', unlocksAt, nextActionAt: unlocksAt }, effects: ['WAITING_STARTED'] };
}

/**
 * The owner proves they are alive: a check-in link, the "I am okay" button, or signing in.
 * Works from every state except UNLOCKED, because after that the vault has already been opened.
 */
export function ownerAlive(core: Core, cfg: Cfg, now: Date): Transition {
  if (core.state === 'UNLOCKED') throw new InvalidTransition('The vault has already been opened');
  const wasRunning = core.state === 'PENDING_APPROVAL' || core.state === 'WAITING_PERIOD';
  return { core: newCore(cfg, now), effects: wasRunning ? ['CANCELLED'] : [] };
}

/**
 * The owner comes back AFTER the vault was opened. We cannot un-ring that bell (people may already have copied things),
 * but we can close access for the future and restart the switch. Only valid from UNLOCKED.
 */
export function ownerReturns(core: Core, cfg: Cfg, now: Date): Transition {
  if (core.state !== 'UNLOCKED') throw new InvalidTransition('Access is not open');
  return { core: newCore(cfg, now), effects: ['ACCESS_CLOSED'] };
}
