import type { Category } from '../crypto/vault';

/**
 * Search, sort and pin for the item list. It all runs on this device on the already-decrypted items: the server is
 * never asked, so what you search for stays private. Pure functions, so they are easy to test.
 */
export interface ListItem {
  id: string;
  category: Category;
  title: string;
  notes: string;
  instructions: string;
  attachments: { name: string }[];
  updatedAt: string;
  broken?: boolean;
}

export type SortKey = 'recent' | 'title' | 'drawer';

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'recent', label: 'Recently changed' },
  { id: 'title', label: 'Title, A to Z' },
  { id: 'drawer', label: 'By drawer' },
];

const DRAWER_ORDER: Category[] = ['insurance', 'bank', 'investments', 'property', 'medical', 'legal', 'other'];

// toLowerCase (not toLocaleLowerCase): same result on every device, and it keeps string lengths for highlighting
const norm = (s: string) => s.toLowerCase();

export function matches(item: ListItem, query: string): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  return [item.title, item.notes, item.instructions, ...item.attachments.map((a) => a.name)].some((t) => norm(t).includes(q));
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};
const byTitle = (a: ListItem, b: ListItem) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });

export function filterAndSort<T extends ListItem>(
  items: readonly T[],
  o: { query: string; sort: SortKey; pinned: ReadonlySet<string>; category: Category | 'all' },
): T[] {
  return items
    .filter((i) => (o.category === 'all' || i.category === o.category) && matches(i, o.query))
    .sort((a, b) => {
      if (!!a.broken !== !!b.broken) return a.broken ? 1 : -1; // items that could not be decrypted go last
      const pa = o.pinned.has(a.id);
      const pb = o.pinned.has(b.id);
      if (pa !== pb) return pa ? -1 : 1;
      if (o.sort === 'title') return byTitle(a, b);
      if (o.sort === 'drawer') return DRAWER_ORDER.indexOf(a.category) - DRAWER_ORDER.indexOf(b.category) || byTitle(a, b);
      return time(b.updatedAt) - time(a.updatedAt);
    });
}

/** Split text into pieces so the matches can be wrapped in <mark>. No HTML strings, no regular expressions. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const q = norm(query.trim());
  const lower = norm(text);
  if (!q || lower.length !== text.length) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}
