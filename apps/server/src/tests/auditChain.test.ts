import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENESIS, nextRecord, verifyChain, type AuditRecord } from '../utils/auditChain.js';

function build(n: number): AuditRecord[] {
  const out: AuditRecord[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      nextRecord(out.at(-1) ?? null, {
        ts: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        actorType: i % 2 ? 'contact' : 'owner',
        actorLabel: i % 2 ? 'Priya' : 'owner',
        action: i % 3 ? 'vault.item_created' : 'login',
        meta: { n: i, note: `entry ${i}` },
      }),
    );
  }
  return out;
}

test('an untouched chain verifies and reports its head hash', () => {
  const chain = build(6);
  const r = verifyChain(chain);
  assert.ok(r.ok);
  assert.equal(r.ok && r.count, 6);
  assert.equal(r.ok && r.headHash, chain[5].hash);
  assert.equal(chain[0].prevHash, GENESIS);
});

test('an empty log is valid', () => assert.deepEqual(verifyChain([]), { ok: true, count: 0, headHash: GENESIS }));

test('editing a past entry is detected at that entry', () => {
  const chain = build(6);
  chain[2] = { ...chain[2], meta: { ...chain[2].meta, note: 'edited' } };
  assert.deepEqual(verifyChain(chain), { ok: false, brokenAtSeq: 3, reason: 'The entry was changed after it was written' });
});

test('editing an entry AND recomputing only its own hash still breaks the next link', () => {
  const chain = build(6);
  const forged = nextRecord(chain[1], { ts: chain[2].ts, actorType: 'system', actorLabel: 'system', action: 'forged', meta: {} });
  chain[2] = forged;
  const r = verifyChain(chain);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.brokenAtSeq, 4);
});

test('deleting an entry from the middle is detected', () => {
  const chain = build(6);
  chain.splice(3, 1);
  const r = verifyChain(chain);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.brokenAtSeq, 4);
});

test('reordering is detected', () => {
  const chain = build(5);
  [chain[1], chain[2]] = [chain[2], chain[1]];
  assert.equal(verifyChain(chain).ok, false);
});

test('meta key order does not change the hash', () => {
  const a = nextRecord(null, { ts: 't', actorType: 'owner', actorLabel: 'owner', action: 'x', meta: { a: 1, b: 2 } });
  const b = nextRecord(null, { ts: 't', actorType: 'owner', actorLabel: 'owner', action: 'x', meta: { b: 2, a: 1 } });
  assert.equal(a.hash, b.hash);
});

test('KNOWN LIMIT: cutting entries off the END is not detectable from the chain alone', () => {
  const chain = build(6);
  const r = verifyChain(chain.slice(0, 4));
  assert.ok(r.ok); // still "valid"...
  assert.notEqual(r.ok && r.headHash, chain[5].hash); // ...but the head hash differs, so remembering the head hash catches it
});
