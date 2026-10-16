import { createHash } from 'node:crypto';

/**
 * Tamper-evident log. Every entry stores the hash of the previous entry, so changing, deleting or re-ordering any
 * past entry breaks every hash after it. Pure functions: no database, easy to test.
 */
export type Meta = Record<string, string | number | boolean | null>;

export interface AuditCore {
  seq: number; // 1, 2, 3 ... per owner, no gaps
  ts: string; // ISO timestamp
  actorType: 'owner' | 'contact' | 'system';
  actorLabel: string;
  action: string;
  meta: Meta;
}
export type AuditRecord = AuditCore & { prevHash: string; hash: string };

export const GENESIS = '0'.repeat(64);

/** Fixed field order and sorted meta keys: the same entry always serialises to the same bytes. */
export const canonical = (e: AuditCore): string =>
  JSON.stringify([e.seq, e.ts, e.actorType, e.actorLabel, e.action, Object.entries(e.meta).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]);

export const computeHash = (prevHash: string, e: AuditCore): string =>
  createHash('sha256').update(`${prevHash}\n${canonical(e)}`).digest('hex');

export function nextRecord(prev: { seq: number; hash: string } | null, e: Omit<AuditCore, 'seq'>): AuditRecord {
  const core: AuditCore = { ...e, seq: (prev?.seq ?? 0) + 1 };
  const prevHash = prev?.hash ?? GENESIS;
  return { ...core, prevHash, hash: computeHash(prevHash, core) };
}

export type ChainResult = { ok: true; count: number; headHash: string } | { ok: false; brokenAtSeq: number; reason: string };

/** `records` must be in ascending seq order. */
export function verifyChain(records: AuditRecord[]): ChainResult {
  let prevHash = GENESIS;
  let expectedSeq = 1;
  for (const r of records) {
    if (r.seq !== expectedSeq) return { ok: false, brokenAtSeq: expectedSeq, reason: 'An entry is missing or out of order' };
    if (r.prevHash !== prevHash) return { ok: false, brokenAtSeq: r.seq, reason: 'The link to the previous entry does not match' };
    if (computeHash(r.prevHash, r) !== r.hash) return { ok: false, brokenAtSeq: r.seq, reason: 'The entry was changed after it was written' };
    prevHash = r.hash;
    expectedSeq++;
  }
  return { ok: true, count: records.length, headHash: prevHash };
}
