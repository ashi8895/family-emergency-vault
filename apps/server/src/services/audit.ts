import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { nextRecord, verifyChain, type AuditRecord, type Meta } from '../utils/auditChain.js';

export interface Actor {
  type: 'owner' | 'contact' | 'system';
  label: string;
}
export const OWNER: Actor = { type: 'owner', label: 'owner' };
export const SYSTEM: Actor = { type: 'system', label: 'system' };
export const contactActor = (name: string): Actor => ({ type: 'contact', label: name.slice(0, 100) });

/** Flat, small, and never a secret: the log is readable by the owner and must not become a place to leak things. */
const clean = (meta: Meta): Meta =>
  Object.fromEntries(Object.entries(meta).slice(0, 10).map(([k, v]) => [k.slice(0, 40), typeof v === 'string' ? v.slice(0, 200) : v]));

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

async function append(ownerId: Types.ObjectId | string, actor: Actor, action: string, meta: Meta): Promise<void> {
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      const [last] = await AuditLog.find({ ownerId }).sort({ seq: -1 }).limit(1);
      const rec = nextRecord(last ? { seq: last.seq, hash: last.hash } : null, {
        ts: new Date().toISOString(),
        actorType: actor.type,
        actorLabel: actor.label,
        action,
        meta: clean(meta),
      });
      try {
        await AuditLog.create({ ownerId, ...rec, ts: new Date(rec.ts) });
        return;
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
        // Another server process appended first: wait a few ms, read the new head and try again.
        await new Promise((r) => setTimeout(r, Math.random() * 15));
      }
    }
    console.error('Audit append gave up after repeated conflicts');
  } catch (e) {
    console.error('Audit failed:', e instanceof Error ? e.message : 'unknown');
  }
}

// Appends for the same owner are queued inside this process. Without this, a burst of simultaneous events (for example
// a family opening several files at once) would all race for the same sequence number and lose entries after a few retries.
// The unique index plus retry in append() still covers two server processes writing at the same time.
const queues = new Map<string, Promise<void>>();

/**
 * Append one entry to the owner's hash chain. Best effort: a logging problem must never break the real action,
 * so errors are printed and swallowed.
 */
export function audit(ownerId: Types.ObjectId | string, actor: Actor, action: string, meta: Meta = {}): Promise<void> {
  const key = String(ownerId);
  const run = (queues.get(key) ?? Promise.resolve()).then(() => append(ownerId, actor, action, meta));
  const tail = run.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

export async function listAudit(ownerId: Types.ObjectId | string, opts: { limit: number; before?: number }) {
  const rows = await AuditLog.find({ ownerId, ...(opts.before ? { seq: { $lt: opts.before } } : {}) })
    .sort({ seq: -1 })
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  return {
    entries: page.map((r) => ({ seq: r.seq, ts: r.ts, actorType: r.actorType, actorLabel: r.actorLabel, action: r.action, meta: r.meta ?? {} })),
    hasMore: rows.length > opts.limit,
  };
}

export async function verifyAudit(ownerId: Types.ObjectId | string) {
  const rows = await AuditLog.find({ ownerId }).sort({ seq: 1 }).limit(20_000);
  const records: AuditRecord[] = rows.map((r) => ({
    seq: r.seq,
    ts: new Date(r.ts).toISOString(),
    actorType: r.actorType,
    actorLabel: r.actorLabel,
    action: r.action,
    meta: r.meta ?? {},
    prevHash: r.prevHash,
    hash: r.hash,
  }));
  return verifyChain(records);
}
