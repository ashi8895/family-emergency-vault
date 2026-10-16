import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSteps, nextStep, progress, type SetupFacts } from './setupSteps';

const none: SetupFacts = { items: 0, contactsTotal: 0, contactsAccepted: 0, armed: false, armedReason: 'Create key pieces first (Trusted people tab).', twoFactor: false };
const ids = (f: SetupFacts) => buildSteps(f).filter((s) => s.done).map((s) => s.id);

test('a brand new account has nothing done and points at the first step', () => {
  const steps = buildSteps(none);
  assert.deepEqual(ids(none), []);
  assert.equal(nextStep(steps)!.id, 'items');
  assert.deepEqual(progress(steps), { done: 0, total: 5 });
});

test('each fact completes exactly its own step', () => {
  assert.deepEqual(ids({ ...none, items: 3 }), ['items']);
  assert.deepEqual(ids({ ...none, contactsTotal: 2 }), ['invite']);
  assert.deepEqual(ids({ ...none, contactsTotal: 1 }), []);
  assert.deepEqual(ids({ ...none, contactsTotal: 2, contactsAccepted: 2 }), ['invite', 'accept']);
  assert.deepEqual(ids({ ...none, armed: true }), ['pieces']);
  assert.deepEqual(ids({ ...none, twoFactor: true }), ['twofactor']);
});

test('the "next" pointer follows the order, and skips the optional step until the required ones are done', () => {
  const nearly: SetupFacts = { items: 1, contactsTotal: 2, contactsAccepted: 2, armed: false, armedReason: 'x', twoFactor: false };
  assert.equal(nextStep(buildSteps(nearly))!.id, 'pieces');
  assert.equal(nextStep(buildSteps({ ...nearly, armed: true }))!.id, 'twofactor'); // only the optional one is left
  assert.equal(nextStep(buildSteps({ ...nearly, armed: true, twoFactor: true })), null);
});

test('the pieces step explains WHY it is blocked, using the server reason once two people accepted', () => {
  const blocked = buildSteps({ ...none, items: 1, contactsTotal: 2, contactsAccepted: 1 }).find((s) => s.id === 'pieces')!;
  assert.match(blocked.hint, /after two people have accepted/);
  const reason = buildSteps({ ...none, contactsAccepted: 2, armedReason: 'Not enough trusted people hold a current key piece. Create the key pieces again.' }).find((s) => s.id === 'pieces')!;
  assert.match(reason.hint, /Not enough trusted people/);
});

test('hints show the real counts', () => {
  const s = buildSteps({ ...none, contactsTotal: 1, contactsAccepted: 1 });
  assert.match(s.find((x) => x.id === 'invite')!.hint, /invited 1 so far/);
  assert.match(s.find((x) => x.id === 'accept')!.hint, /1 of at least 2/);
});

test('every step sends the user to a real tab', () => {
  for (const s of buildSteps(none)) assert.ok(['vault', 'people', 'switch', 'security'].includes(s.tab));
});
