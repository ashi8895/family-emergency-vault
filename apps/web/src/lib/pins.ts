/** Which items the person starred. Kept on this device only (opaque ids, per account). */
export interface PrefStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const pinKey = (userId: string) => `fev-pins-${userId}`;

export function loadPins(store: PrefStore, userId: string): Set<string> {
  try {
    const raw = store.get(pinKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 200) : []);
  } catch {
    return new Set(); // corrupt value: start empty rather than crash
  }
}

export const savePins = (store: PrefStore, userId: string, pins: ReadonlySet<string>) => store.set(pinKey(userId), JSON.stringify([...pins]));

export function togglePin(pins: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(pins);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Forget pins of items that no longer exist. */
export const prunePins = (pins: ReadonlySet<string>, existing: Iterable<string>): Set<string> => {
  const keep = new Set(existing);
  return new Set([...pins].filter((id) => keep.has(id)));
};
