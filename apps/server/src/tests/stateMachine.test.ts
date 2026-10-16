import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  approvalsChanged,
  InvalidTransition,
  MAX_REMINDERS,
  newCore,
  ownerAlive,
  ownerReturns,
  tick,
  type Cfg,
  type Core,
} from '../services/emergencyStateMachine.js';

const DAY = 86_400_000;
const cfg: Cfg = { checkInIntervalMs: 30 * DAY, reminderGapMs: 3 * DAY, waitingPeriodMs: 7 * DAY };
const T0 = new Date('2026-01-01T00:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const none = { validApprovals: 0, threshold: 2 };

test('nothing happens before the check-in is due', () => {
  const core = newCore(cfg, T0);
  assert.equal(tick(core, cfg, at(29.99), none), null);
  assert.equal(core.state, 'ACTIVE');
});

test('full timeline with 30/3/7 day settings', () => {
  let core = newCore(cfg, T0);

  // day 30: check-in email
  let t = tick(core, cfg, at(30), none)!;
  assert.deepEqual(t.effects, ['SEND_CHECKIN']);
  assert.equal(t.core.state, 'WARNING');
  core = t.core;

  // day 33 and 36: reminders 1 and 2
  t = tick(core, cfg, at(33), none)!;
  assert.deepEqual(t.effects, ['SEND_REMINDER']);
  assert.equal(t.core.remindersSent, 1);
  core = t.core;
  t = tick(core, cfg, at(36), none)!;
  assert.deepEqual(t.effects, ['SEND_REMINDER']);
  assert.equal(t.core.remindersSent, MAX_REMINDERS);
  core = t.core;

  // day 39: escalate to the trusted people; nothing is timed any more
  t = tick(core, cfg, at(39), none)!;
  assert.deepEqual(t.effects, ['OPEN_CASE_AND_NOTIFY']);
  assert.equal(t.core.state, 'PENDING_APPROVAL');
  assert.equal(t.core.nextActionAt, null);
  core = t.core;
  assert.equal(tick(core, cfg, at(400), none), null); // waits for people, not for time

  // day 41: second approval arrives -> 7 day waiting period
  assert.equal(approvalsChanged(core, cfg, at(41), { validApprovals: 1, threshold: 2 }), null);
  t = approvalsChanged(core, cfg, at(41), { validApprovals: 2, threshold: 2 })!;
  assert.deepEqual(t.effects, ['WAITING_STARTED']);
  assert.equal(t.core.state, 'WAITING_PERIOD');
  assert.deepEqual(t.core.unlocksAt, at(48));
  core = t.core;

  // not open one second early, open exactly at day 48
  assert.equal(tick(core, cfg, new Date(at(48).getTime() - 1), { validApprovals: 2, threshold: 2 }), null);
  t = tick(core, cfg, at(48), { validApprovals: 2, threshold: 2 })!;
  assert.deepEqual(t.effects, ['UNLOCKED']);
  assert.equal(t.core.state, 'UNLOCKED');
});

test('the owner can stop it at every stage before UNLOCKED', () => {
  const warning: Core = { ...newCore(cfg, T0), state: 'WARNING', remindersSent: 1, nextActionAt: at(36) };
  const pending: Core = { ...newCore(cfg, T0), state: 'PENDING_APPROVAL', nextActionAt: null };
  const waiting: Core = { ...newCore(cfg, T0), state: 'WAITING_PERIOD', unlocksAt: at(48), nextActionAt: at(48) };

  for (const [core, expectedEffects] of [
    [newCore(cfg, T0), []],
    [warning, []],
    [pending, ['CANCELLED']],
    [waiting, ['CANCELLED']],
  ] as const) {
    const t = ownerAlive(core, cfg, at(40));
    assert.equal(t.core.state, 'ACTIVE');
    assert.equal(t.core.remindersSent, 0);
    assert.equal(t.core.unlocksAt, null);
    assert.deepEqual(t.core.lastCheckInAt, at(40));
    assert.deepEqual(t.core.nextActionAt, at(70)); // a fresh 30 day clock
    assert.deepEqual(t.effects, expectedEffects);
  }
});

test('after UNLOCKED the owner can no longer cancel', () => {
  const unlocked: Core = { ...newCore(cfg, T0), state: 'UNLOCKED', nextActionAt: null };
  assert.throws(() => ownerAlive(unlocked, cfg, at(50)), InvalidTransition);
  assert.equal(tick(unlocked, cfg, at(500), none), null);
});

test('removing people during the wait stops the unlock and returns to approval', () => {
  const waiting: Core = { ...newCore(cfg, T0), state: 'WAITING_PERIOD', unlocksAt: at(48), nextActionAt: at(48) };
  const t = tick(waiting, cfg, at(48), { validApprovals: 1, threshold: 2 })!;
  assert.deepEqual(t.effects, ['APPROVALS_LOST']);
  assert.equal(t.core.state, 'PENDING_APPROVAL');
  assert.equal(t.core.unlocksAt, null);
});

test('approvals only matter in PENDING_APPROVAL', () => {
  for (const state of ['ACTIVE', 'WARNING', 'WAITING_PERIOD', 'UNLOCKED'] as const) {
    assert.equal(approvalsChanged({ ...newCore(cfg, T0), state }, cfg, at(1), { validApprovals: 5, threshold: 2 }), null);
  }
});

test('the machine never mutates its input', () => {
  const core = newCore(cfg, T0);
  const snapshot = JSON.stringify(core);
  tick(core, cfg, at(31), none);
  ownerAlive(core, cfg, at(31));
  assert.equal(JSON.stringify(core), snapshot);
});

test('works with a tiny time unit (demo mode: 1 "day" = 1 minute)', () => {
  const MIN = 60_000;
  const demo: Cfg = { checkInIntervalMs: 1 * MIN, reminderGapMs: 1 * MIN, waitingPeriodMs: 2 * MIN };
  let core = newCore(demo, T0);
  const steps: string[] = [];
  for (let m = 1; m <= 4; m++) {
    const t = tick(core, demo, new Date(T0.getTime() + m * MIN), none);
    if (t) {
      steps.push(t.effects[0]);
      core = t.core;
    }
  }
  assert.deepEqual(steps, ['SEND_CHECKIN', 'SEND_REMINDER', 'SEND_REMINDER', 'OPEN_CASE_AND_NOTIFY']);
});

test('the owner returning after UNLOCKED closes access and restarts a fresh clock; only valid from UNLOCKED', () => {
  const unlocked: Core = { ...newCore(cfg, T0), state: 'UNLOCKED', nextActionAt: null };
  const t = ownerReturns(unlocked, cfg, at(60));
  assert.equal(t.core.state, 'ACTIVE');
  assert.deepEqual(t.effects, ['ACCESS_CLOSED']);
  assert.deepEqual(t.core.nextActionAt, at(90));
  for (const state of ['ACTIVE', 'WARNING', 'PENDING_APPROVAL', 'WAITING_PERIOD'] as const) {
    assert.throws(() => ownerReturns({ ...newCore(cfg, T0), state }, cfg, at(1)), InvalidTransition);
  }
});
